import type { AuthState } from '../../../shared/contracts';

export type ProbeResult = {
  exitCode: number | null;
  stderr: string;
  stdout?: string;
  errorCode?: string;
};

const AUTH_FAILURE_PATTERN =
  /please run copilot login|copilot login|log[ -]?in|authenticate|authentication|credential|token|sign[ -]?in/i;
const CLI_MISSING_PATTERN =
  /not recognized as an internal or external command|command not found|enoent|cannot find|no such file or directory/i;

export function parseModelCatalog(helpText: string): string[] {
  const models: string[] = [];
  const seen = new Set<string>();
  const lines = helpText.split(/\r?\n/);
  let inModelSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!inModelSection) {
      if (/^`?model`?:/i.test(line)) {
        inModelSection = true;
      }

      continue;
    }

    if (line.length === 0) {
      if (models.length > 0) {
        break;
      }

      continue;
    }

    if (/^`[^`]+`:/.test(line) || /^[a-z][a-z0-9-]*:/i.test(line)) {
      break;
    }

    const match = line.match(/^-\s+"([^"]+)"\s*$/);

    if (match === null) {
      continue;
    }

    const model = match[1].trim();

    if (model.length === 0 || seen.has(model)) {
      continue;
    }

    seen.add(model);
    models.push(model);
  }

  return models;
}

export function parseProbeResult(result: ProbeResult): AuthState {
  if (result.exitCode === 0) {
    return 'ready';
  }

  return classifyCopilotFailure(result);
}

export function classifyCopilotFailure(result: ProbeResult): AuthState {
  if (typeof result.errorCode === 'string' && result.errorCode.toUpperCase() === 'ENOENT') {
    return 'cli-missing';
  }

  const diagnostic = [result.stderr, result.stdout ?? ''].join('\n');

  if (AUTH_FAILURE_PATTERN.test(diagnostic)) {
    return 'reauth-required';
  }

  if (CLI_MISSING_PATTERN.test(diagnostic)) {
    return 'cli-missing';
  }

  return 'checking';
}