import { execFile } from 'node:child_process';
import type { ModelId, AuthState } from '../../../shared/contracts';
import { parseModelCatalog, parseProbeResult } from './modelCatalog';

const PROBE_MODEL = 'gpt-5.4-mini';
const PROBE_PROMPT = 'Reply with AUTH_OK only.';
const PROMPT_FLAGS = ['--allow-all-tools', '--output-format', 'json', '--no-custom-instructions'] as const;

export type CopilotCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type RunCopilotCommand = (args: string[]) => Promise<CopilotCommandResult>;

type CopilotAdapterDependencies = {
  runCommand?: RunCopilotCommand;
};

type ExecFileFailure = NodeJS.ErrnoException & {
  stdout?: string;
  stderr?: string;
  code?: string | number;
};

export class CopilotAdapter {
  private readonly runCommand: RunCopilotCommand;

  constructor(dependencies: CopilotAdapterDependencies = {}) {
    this.runCommand = dependencies.runCommand ?? runCopilotCommand;
  }

  async listModels(): Promise<ModelId[]> {
    const result = await this.runCommand(['help', 'config']);
    return parseModelCatalog(result.stdout);
  }

  async probeAuth(): Promise<AuthState> {
    try {
      const result = await this.runCommand(buildPromptArgs(PROBE_MODEL, PROBE_PROMPT));
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

    const result = await this.runCommand(buildPromptArgs(normalizedModel, prompt));
    return result.stdout;
  }

  async startLogin(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = execFile('copilot', ['login'], { windowsHide: true });

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

function runCopilotCommand(args: string[]): Promise<CopilotCommandResult> {
  return new Promise((resolve, reject) => {
    execFile(
      'copilot',
      args,
      {
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024
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

  return {
    exitCode: typeof failure.code === 'number' ? failure.code : null,
    stderr: typeof failure.stderr === 'string' ? failure.stderr : failure.message,
    stdout: typeof failure.stdout === 'string' ? failure.stdout : '',
    errorCode: typeof failure.code === 'string' ? failure.code : undefined
  };
}