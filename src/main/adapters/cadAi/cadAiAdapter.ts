import { execFile } from 'node:child_process';
import { resolve, sep } from 'node:path';
import { locateCadAiRoot, resolveCadAiCommand } from './cadAiLocator';

const CAD_AI_TIMEOUT_MS = 120_000;

export type CadAiCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type CadAiIngestResult = {
  sourcePath: string;
  cachePath: string;
  dxfPath: string | null;
};

type RunCadAiCommand = (
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs: number }
) => Promise<CadAiCommandResult>;

type CadAiAdapterOptions = {
  cadAiRoot?: string;
  runCommand?: RunCadAiCommand;
};

type ExecFileFailure = NodeJS.ErrnoException & {
  stdout?: string;
  stderr?: string;
};

export class CadAiAdapter {
  private readonly cadAiRoot: string;

  private readonly runCommand: RunCadAiCommand;

  constructor(options: CadAiAdapterOptions = {}) {
    this.cadAiRoot = options.cadAiRoot ?? locateCadAiRoot();
    this.runCommand = options.runCommand ?? runCadAiCommand;
  }

  async ingest(filePath: string): Promise<CadAiIngestResult> {
    const sourcePath = resolve(filePath);
    const executable = resolveCadAiCommand(this.cadAiRoot);
    const result = await this.runCommand(
      executable.command,
      [...executable.args, 'ingest', sourcePath, '--format', 'json'],
      {
        cwd: executable.cwd,
        timeoutMs: CAD_AI_TIMEOUT_MS
      }
    );
    const payload = parseJsonRecord(result.stdout);
    const cachePath = readRequiredPath(payload, 'cache');
    const dxfPath = readOptionalPath(payload, ['dxf', 'dxfPath', 'dxf_path']);

    return {
      sourcePath,
      cachePath,
      dxfPath: dxfPath ?? (sourcePath.toLowerCase().endsWith('.dxf') ? sourcePath : null)
    };
  }
}

function runCadAiCommand(command: string, args: string[], options: { cwd: string; timeoutMs: number }): Promise<CadAiCommandResult> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      command,
      args,
      {
        cwd: options.cwd,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
        timeout: options.timeoutMs,
        killSignal: 'SIGTERM'
      },
      (error, stdout, stderr) => {
        if (error !== null) {
          reject(buildCadAiError(error, stdout, stderr));
          return;
        }

        resolvePromise({
          exitCode: 0,
          stdout,
          stderr
        });
      }
    );
  });
}

function buildCadAiError(error: ExecFileFailure, stdout: string, stderr: string): Error {
  const summary = stderr.trim() || stdout.trim() || error.message;
  return Object.assign(new Error(summary), {
    cause: error,
    stdout,
    stderr
  });
}

function parseJsonRecord(output: string): Record<string, unknown> {
  const trimmed = output.trim();

  if (trimmed.length === 0) {
    throw new Error('CAD_AI returned no JSON output.');
  }

  return JSON.parse(trimmed) as Record<string, unknown>;
}

function readRequiredPath(record: Record<string, unknown>, key: string): string {
  const value = record[key];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`CAD_AI response is missing ${key}.`);
  }

  return normalizePath(value);
}

function readOptionalPath(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'string' && value.trim().length > 0) {
      return normalizePath(value);
    }
  }

  return null;
}

function normalizePath(value: string): string {
  return value.includes(':') || value.startsWith('\\') || value.startsWith('/')
    ? resolve(value)
    : resolve(value.split(/[\\/]/).join(sep));
}