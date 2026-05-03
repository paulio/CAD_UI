import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export type CadAiCommand = {
  command: string;
  args: string[];
  cwd: string;
};

export function locateCadAiRoot(startDirectory: string = process.cwd()): string {
  const candidates = new Set<string>();
  const envRoot = process.env.CAD_AI_ROOT;

  if (typeof envRoot === 'string' && envRoot.trim().length > 0) {
    candidates.add(resolve(envRoot));
  }

  let current = resolve(startDirectory);

  while (true) {
    candidates.add(join(current, 'CAD_AI'));

    const parent = dirname(current);

    if (parent === current) {
      break;
    }

    current = parent;
  }

  for (const candidate of candidates) {
    try {
      resolveCadAiCommand(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error(`Unable to locate CAD_AI root from ${startDirectory}`);
}

export function resolveCadAiCommand(cadAiRoot: string): CadAiCommand {
  const root = resolve(cadAiRoot);
  const cadqExe = join(root, '.venv', 'Scripts', 'cadq.exe');
  const pythonExe = join(root, '.venv', 'Scripts', 'python.exe');

  if (existsSync(cadqExe)) {
    return {
      command: cadqExe,
      args: [],
      cwd: root
    };
  }

  if (existsSync(pythonExe)) {
    return {
      command: pythonExe,
      args: ['-c', 'from cadq.cli import app; app()'],
      cwd: root
    };
  }

  throw new Error(`Unable to locate CAD_AI executable under ${root}`);
}