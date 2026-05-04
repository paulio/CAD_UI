import { describe, expect, it, vi } from 'vitest';
import { CopilotAdapter } from '../../src/main/adapters/copilot/copilotAdapter';
import { classifyCopilotFailure, parseModelCatalog, parseProbeResult } from '../../src/main/adapters/copilot/modelCatalog';

const helpText = [
  '  `theme`: Terminal color theme.',
  '  `model`: AI model to use for Copilot CLI; can be changed with /model command or --model flag option.',
  '    - "gpt-5.4"',
  '    - "gpt-5.4-mini"',
  '    - "claude-sonnet-4.6"',
  '  `approval-policy`: Default approval policy.'
].join('\n');

describe('Copilot model parsing', () => {
  it('extracts models from copilot help config output', () => {
    expect(parseModelCatalog(helpText)).toEqual(['gpt-5.4', 'gpt-5.4-mini', 'claude-sonnet-4.6']);
  });

  it('normalizes auth failures from probe stderr', () => {
    expect(parseProbeResult({ exitCode: 1, stderr: 'Please run copilot login first.' })).toEqual('reauth-required');
  });

  it('keeps unknown probe failures in a safe checking state', () => {
    expect(classifyCopilotFailure({ exitCode: 1, stderr: 'network interrupted', errorCode: 'ETIMEDOUT' })).toEqual(
      'checking'
    );
  });
});

describe('CopilotAdapter', () => {
  it('lists models from the verified config help command', async () => {
    const runCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: helpText,
      stderr: ''
    });
    const adapter = new CopilotAdapter({ runCommand });

    await expect(adapter.listModels()).resolves.toEqual(['gpt-5.4', 'gpt-5.4-mini', 'claude-sonnet-4.6']);
    expect(runCommand).toHaveBeenCalledWith(['help', 'config'], { timeoutMs: 30000 });
  });

  it('probes auth with the verified prompt invocation', async () => {
    const runCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: '{"type":"assistant","message":"AUTH_OK"}',
      stderr: ''
    });
    const adapter = new CopilotAdapter({ runCommand });

    await expect(adapter.probeAuth()).resolves.toBe('ready');
    expect(runCommand).toHaveBeenCalledWith([
      '--model',
      'gpt-5.4-mini',
      '-p',
      'Reply with AUTH_OK only.',
      '--allow-all-tools',
      '--output-format',
      'json',
      '--no-custom-instructions'
    ], { timeoutMs: 30000 });
  });

  it('maps prompt auth failures into a reauth state', async () => {
    const runCommand = vi.fn().mockRejectedValue({
      exitCode: 1,
      stderr: 'Please run copilot login first.'
    });
    const adapter = new CopilotAdapter({ runCommand });

    await expect(adapter.probeAuth()).resolves.toBe('reauth-required');
  });

  it('maps prompt timeouts into a safe checking state', async () => {
    const runCommand = vi.fn().mockRejectedValue({
      code: 'ETIMEDOUT',
      message: 'Command timed out',
      stderr: ''
    });
    const adapter = new CopilotAdapter({ runCommand });

    await expect(adapter.probeAuth()).resolves.toBe('checking');
  });

  it('extracts final assistant text from Copilot JSONL output', async () => {
    const runCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: [
        '{"type":"assistant.message_delta","delta":{"text":"Hello "}}',
        '{"type":"assistant.message","message":{"content":[{"type":"output_text","text":"Hello from Copilot"}]}}'
      ].join('\n'),
      stderr: ''
    });
    const adapter = new CopilotAdapter({ runCommand });

    await expect(adapter.runPrompt('gpt-5.4', 'Summarize the drawing.')).resolves.toBe('Hello from Copilot');
    expect(runCommand).toHaveBeenCalledWith([
      '--model',
      'gpt-5.4',
      '-p',
      'Summarize the drawing.',
      '--allow-all-tools',
      '--output-format',
      'json',
      '--no-custom-instructions'
    ], { timeoutMs: 30000 });
  });

  it('falls back to accumulated assistant deltas when no final message is present', async () => {
    const runCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: [
        '{"type":"assistant.message_delta","delta":{"text":"Hello"}}',
        '{"type":"assistant.message_delta","delta":{"text":" from Copilot"}}'
      ].join('\n'),
      stderr: ''
    });
    const adapter = new CopilotAdapter({ runCommand });

    await expect(adapter.runPrompt('gpt-5.4', 'Summarize the drawing.')).resolves.toBe('Hello from Copilot');
  });
});