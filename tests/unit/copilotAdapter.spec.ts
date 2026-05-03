import { describe, expect, it, vi } from 'vitest';
import { CopilotAdapter } from '../../src/main/adapters/copilot/copilotAdapter';
import { parseModelCatalog, parseProbeResult } from '../../src/main/adapters/copilot/modelCatalog';

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
    expect(runCommand).toHaveBeenCalledWith(['help', 'config']);
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
    ]);
  });

  it('maps prompt auth failures into a reauth state', async () => {
    const runCommand = vi.fn().mockRejectedValue({
      exitCode: 1,
      stderr: 'Please run copilot login first.'
    });
    const adapter = new CopilotAdapter({ runCommand });

    await expect(adapter.probeAuth()).resolves.toBe('reauth-required');
  });

  it('returns raw prompt output for higher layers to adapt', async () => {
    const runCommand = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: '{"type":"assistant","message":"Hello from Copilot"}',
      stderr: ''
    });
    const adapter = new CopilotAdapter({ runCommand });

    await expect(adapter.runPrompt('gpt-5.4', 'Summarize the drawing.')).resolves.toContain('Hello from Copilot');
    expect(runCommand).toHaveBeenCalledWith([
      '--model',
      'gpt-5.4',
      '-p',
      'Summarize the drawing.',
      '--allow-all-tools',
      '--output-format',
      'json',
      '--no-custom-instructions'
    ]);
  });
});