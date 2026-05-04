import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ModelId, AuthState } from '../../../shared/contracts';
import { parseModelCatalog, parseProbeResult } from './modelCatalog';

const PROBE_MODEL = 'gpt-5.4-mini';
const PROBE_PROMPT = 'Reply with AUTH_OK only.';
const PROMPT_FLAGS = ['--allow-all-tools', '--output-format', 'json', '--no-custom-instructions'] as const;
const MODEL_DISCOVERY_TIMEOUT_MS = 30_000;
const PROMPT_TIMEOUT_MS = 30_000;

export type CopilotCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type CopilotCommandOptions = {
  timeoutMs: number;
};

export type RunCopilotCommand = (args: string[], options: CopilotCommandOptions) => Promise<CopilotCommandResult>;

type CopilotAdapterDependencies = {
  runCommand?: RunCopilotCommand;
};

type ResolvedCopilotCommand = {
  command: string;
  argsPrefix: string[];
};

type ExecFileFailure = NodeJS.ErrnoException & {
  stdout?: string;
  stderr?: string;
  code?: string | number;
  signal?: NodeJS.Signals;
  killed?: boolean;
};

export class CopilotAdapter {
  private readonly runCommand: RunCopilotCommand;

  constructor(dependencies: CopilotAdapterDependencies = {}) {
    this.runCommand = dependencies.runCommand ?? runCopilotCommand;
  }

  async listModels(): Promise<ModelId[]> {
    const result = await this.runCommand(['help', 'config'], { timeoutMs: MODEL_DISCOVERY_TIMEOUT_MS });
    return parseModelCatalog(result.stdout);
  }

  async probeAuth(): Promise<AuthState> {
    try {
      const result = await this.runCommand(buildPromptArgs(PROBE_MODEL, PROBE_PROMPT), {
        timeoutMs: PROMPT_TIMEOUT_MS
      });
      return parseProbeResult(result);
    } catch (error) {
      return parseProbeResult(normalizeCommandFailure(error));
    }
  }

  async runPrompt(model: ModelId, prompt: string): Promise<string> {
    const normalizedModel = model.trim();

    if (normalizedModel.length === 0) {
      throw new Error('A Copilot model is required.');
    }

    const result = await this.runCommand(buildPromptArgs(normalizedModel, prompt), {
      timeoutMs: PROMPT_TIMEOUT_MS
    });
    return extractAssistantText(result.stdout);
  }

  async startLogin(): Promise<void> {
    const resolvedCommand = resolveCopilotCommand();

    await new Promise<void>((resolve, reject) => {
      const child = execFile(resolvedCommand.command, [...resolvedCommand.argsPrefix, 'login'], { windowsHide: true });

      child.once('spawn', () => {
        child.unref();
        resolve();
      });

      child.once('error', (error) => {
        reject(error);
      });
    });
  }
}

function buildPromptArgs(model: string, prompt: string): string[] {
  return ['--model', model, '-p', prompt, ...PROMPT_FLAGS];
}

function runCopilotCommand(args: string[], options: CopilotCommandOptions): Promise<CopilotCommandResult> {
  const resolvedCommand = resolveCopilotCommand();

  return new Promise((resolve, reject) => {
    execFile(
      resolvedCommand.command,
      [...resolvedCommand.argsPrefix, ...args],
      {
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
        timeout: options.timeoutMs,
        killSignal: 'SIGTERM'
      },
      (error, stdout, stderr) => {
        if (error !== null) {
          reject(Object.assign(error, { stdout, stderr }));
          return;
        }

        resolve({
          exitCode: 0,
          stdout,
          stderr
        });
      }
    );
  });
}

function normalizeCommandFailure(error: unknown): {
  exitCode: number | null;
  stderr: string;
  stdout?: string;
  errorCode?: string;
} {
  const failure = error as ExecFileFailure;
  const timedOut =
    failure.killed === true ||
    failure.signal === 'SIGTERM' ||
    (typeof failure.message === 'string' && /timed out/i.test(failure.message));
  const stderr = typeof failure.stderr === 'string' ? failure.stderr : failure.message;

  return {
    exitCode: typeof failure.code === 'number' ? failure.code : null,
    stderr: timedOut && stderr.length > 0 ? `Timed out waiting for Copilot CLI.\n${stderr}` : timedOut ? 'Timed out waiting for Copilot CLI.' : stderr,
    stdout: typeof failure.stdout === 'string' ? failure.stdout : '',
    errorCode: timedOut ? 'ETIMEDOUT' : typeof failure.code === 'string' ? failure.code : undefined
  };
}

function extractAssistantText(output: string): string {
  const trimmed = output.trim();

  if (trimmed.length === 0) {
    return '';
  }

  const lines = trimmed.split(/\r?\n/);
  const finalMessages: string[] = [];
  const deltaMessages: string[] = [];

  for (const line of lines) {
    const candidate = line.trim();

    if (candidate.length === 0) {
      continue;
    }

    try {
      const event = JSON.parse(candidate) as Record<string, unknown>;
      const eventType = typeof event.type === 'string' ? event.type : '';
      const finalText = readAssistantMessageText(event.message);

      if ((eventType === 'assistant.message' || eventType === 'assistant') && finalText.length > 0) {
        finalMessages.push(finalText);
        continue;
      }

      if (eventType === 'assistant.message_delta') {
        const deltaText = readAssistantDeltaText(event);

        if (deltaText.length > 0) {
          deltaMessages.push(deltaText);
        }
      }
    } catch {
      if (!looksLikeJson(candidate)) {
        finalMessages.push(candidate);
      }
    }
  }

  const finalOutput = finalMessages.join('\n').trim();

  if (finalOutput.length > 0) {
    return finalOutput;
  }

  const deltaOutput = deltaMessages.join('').trim();

  if (deltaOutput.length > 0) {
    return deltaOutput;
  }

  return 'Copilot CLI returned no assistant response.';
}

function readAssistantMessageText(message: unknown): string {
  if (typeof message === 'string') {
    return message.trim();
  }

  if (typeof message !== 'object' || message === null) {
    return '';
  }

  const record = message as Record<string, unknown>;

  if (typeof record.content === 'string') {
    return record.content.trim();
  }

  if (!Array.isArray(record.content)) {
    return '';
  }

  const parts = record.content
    .map((entry) => readTextPart(entry))
    .filter((entry) => entry.length > 0);

  return parts.join('\n').trim();
}

function readAssistantDeltaText(event: Record<string, unknown>): string {
  const directDelta = readTextPart(event.delta);

  if (directDelta.length > 0) {
    return directDelta;
  }

  return readTextPart(event.message_delta);
}

function readTextPart(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value !== 'object' || value === null) {
    return '';
  }

  const record = value as Record<string, unknown>;

  if (typeof record.text === 'string') {
    return record.text;
  }

  if (typeof record.content === 'string') {
    return record.content;
  }

  return '';
}

function looksLikeJson(value: string): boolean {
  return value.startsWith('{') || value.startsWith('[');
}

function resolveCopilotCommand(): ResolvedCopilotCommand {
  if (process.platform !== 'win32') {
    return {
      command: 'copilot',
      argsPrefix: []
    };
  }

  const appData = process.env.APPDATA;

  if (typeof appData === 'string' && appData.length > 0) {
    const shimPath = join(appData, 'Code', 'User', 'globalStorage', 'github.copilot-chat', 'copilotCli', 'copilot.ps1');

    if (existsSync(shimPath)) {
      return {
        command: 'powershell.exe',
        argsPrefix: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', shimPath]
      };
    }
  }

  return {
    command: 'copilot',
    argsPrefix: []
  };
}