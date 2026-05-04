import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsStore } from '../../src/main/services/settingsStore';

const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();

vi.mock('electron', () => ({
  dialog: {
    showOpenDialog: vi.fn()
  },
  ipcMain: {
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel);
    }),
    handle: vi.fn((channel: string, handler: (event: unknown, payload: unknown) => unknown) => {
      handlers.set(channel, handler);
    })
  }
}));

import { dialog } from 'electron';
import { registerIpc } from '../../src/main/ipc/registerIpc';
import { ipcChannels } from '../../src/shared/contracts';

function createCopilotAdapterStub() {
  return {
    listModels: vi.fn().mockResolvedValue(['gpt-5.4', 'gpt-5.4-mini']),
    probeAuth: vi.fn().mockResolvedValue('ready'),
    runPrompt: vi.fn().mockResolvedValue('ok')
  };
}

describe('registerIpc', () => {
  const corruptedSettingsFilePath = 'tests/.tmp/register-ipc-settings.json';

  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
    delete process.env.CAD_UI_E2E;
    delete process.env.CAD_UI_E2E_AUTH_STATE;
    delete process.env.CAD_UI_E2E_MODELS;
  });

  it('rejects malformed settings payloads with a controlled error', async () => {
    const save = vi.fn();

    registerIpc({
      load: vi.fn().mockResolvedValue({
        selectedModel: null,
        recentDrawings: [],
        lastDrawingPath: null,
        windowBounds: null,
        lastKnownModels: []
      }),
      save
    } as never, createCopilotAdapterStub());

    const saveSettings = handlers.get(ipcChannels.saveSettings);

    await expect(
      saveSettings?.({}, {
        selectedModel: null,
        recentDrawings: ['drawing.dwg'],
        lastDrawingPath: null,
        windowBounds: {
          width: 'wide',
          height: 768
        }
      })
    ).rejects.toThrow('Invalid app settings payload.');

    expect(save).not.toHaveBeenCalled();
  });

  it('accepts valid settings payloads before saving', async () => {
    const save = vi.fn().mockResolvedValue(undefined);

    registerIpc({
      load: vi.fn().mockResolvedValue({
        selectedModel: null,
        recentDrawings: [],
        lastDrawingPath: null,
        windowBounds: null,
        lastKnownModels: []
      }),
      save
    } as never, createCopilotAdapterStub());

    const saveSettings = handlers.get(ipcChannels.saveSettings);
    const payload = {
      selectedModel: 'gpt-5.4',
      recentDrawings: ['drawing.dwg'],
      lastDrawingPath: 'drawing.dwg',
      windowBounds: {
        width: 1280,
        height: 720
      },
      lastKnownModels: ['gpt-5.4']
    };

    await saveSettings?.({}, payload);

    expect(save).toHaveBeenCalledWith(payload);
  });

  it('rejects malformed prompt requests with a controlled error', async () => {
    registerIpc({
      load: vi.fn().mockResolvedValue({
        selectedModel: null,
        recentDrawings: [],
        lastDrawingPath: null,
        windowBounds: null,
        lastKnownModels: []
      }),
      save: vi.fn()
    } as never, createCopilotAdapterStub());

    const sendPrompt = handlers.get(ipcChannels.sendPrompt);

    await expect(sendPrompt?.({}, { prompt: 42 })).rejects.toThrow('Invalid prompt request payload.');
  });

  it('accepts valid prompt requests and trims the prompt safely', async () => {
    registerIpc({
      load: vi.fn().mockResolvedValue({
        selectedModel: null,
        recentDrawings: [],
        lastDrawingPath: null,
        windowBounds: null,
        lastKnownModels: []
      }),
      save: vi.fn()
    } as never, createCopilotAdapterStub());

    const sendPrompt = handlers.get(ipcChannels.sendPrompt);
    const response = await sendPrompt?.(
      {},
      {
        model: null,
        prompt: '   ',
        drawingPath: null,
        selectedEntityIds: [],
        selectedEntityHandles: []
      }
    );

    expect(response).toMatchObject({
      text: 'Enter a prompt to begin.'
    });
  });

  it('returns default settings from bootstrap when the settings file is corrupted', async () => {
    await rm(dirname(corruptedSettingsFilePath), { force: true, recursive: true });
    await mkdir(dirname(corruptedSettingsFilePath), { recursive: true });
    await writeFile(corruptedSettingsFilePath, '{invalid json', 'utf8');

    registerIpc(new SettingsStore(corruptedSettingsFilePath), createCopilotAdapterStub());

    const loadBootstrap = handlers.get(ipcChannels.loadBootstrap);
    const bootstrap = await loadBootstrap?.({}, undefined);
    const files = await readdir(dirname(corruptedSettingsFilePath));
    const quarantinedFile = files.find((file) => file.startsWith('.register-ipc-settings.json.corrupt.'));

    expect(bootstrap).toEqual({
      authState: 'ready',
      models: ['gpt-5.4', 'gpt-5.4-mini'],
      settings: {
        selectedModel: null,
        recentDrawings: [],
        lastDrawingPath: null,
        windowBounds: null,
        lastKnownModels: ['gpt-5.4', 'gpt-5.4-mini']
      }
    });
    expect(files).toContain('register-ipc-settings.json');
    expect(quarantinedFile).toBeTruthy();
    await expect(readFile(`${dirname(corruptedSettingsFilePath)}/${quarantinedFile}`, 'utf8')).resolves.toBe('{invalid json');

    await rm(dirname(corruptedSettingsFilePath), { force: true, recursive: true });
  });

  it('reconciles a stale selected model during bootstrap', async () => {
    const save = vi.fn().mockResolvedValue(undefined);

    registerIpc(
      {
        load: vi.fn().mockResolvedValue({
          selectedModel: 'stale-model',
          recentDrawings: [],
          lastDrawingPath: null,
          windowBounds: null,
          lastKnownModels: []
        }),
        save
      } as never,
      createCopilotAdapterStub()
    );

    const loadBootstrap = handlers.get(ipcChannels.loadBootstrap);
    const bootstrap = await loadBootstrap?.({}, undefined);

    expect(bootstrap).toEqual({
      authState: 'ready',
      models: ['gpt-5.4', 'gpt-5.4-mini'],
      settings: {
        selectedModel: 'gpt-5.4',
        recentDrawings: [],
        lastDrawingPath: null,
        windowBounds: null,
        lastKnownModels: ['gpt-5.4', 'gpt-5.4-mini']
      }
    });
    expect(save).toHaveBeenCalledWith({
      selectedModel: 'gpt-5.4',
      recentDrawings: [],
      lastDrawingPath: null,
      windowBounds: null,
      lastKnownModels: ['gpt-5.4', 'gpt-5.4-mini']
    });
  });

  it('preserves the saved model when discovery returns an empty catalog', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const copilotAdapter = createCopilotAdapterStub();
    copilotAdapter.listModels.mockResolvedValue([]);

    registerIpc(
      {
        load: vi.fn().mockResolvedValue({
          selectedModel: 'gpt-5.4',
          recentDrawings: [],
          lastDrawingPath: null,
          windowBounds: null,
          lastKnownModels: []
        }),
        save
      } as never,
      copilotAdapter
    );

    const loadBootstrap = handlers.get(ipcChannels.loadBootstrap);
    const bootstrap = await loadBootstrap?.({}, undefined);

    expect(bootstrap).toEqual({
      authState: 'ready',
      models: [],
      settings: {
        selectedModel: 'gpt-5.4',
        recentDrawings: [],
        lastDrawingPath: null,
        windowBounds: null,
        lastKnownModels: []
      }
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('uses checking instead of cli-missing when auth probing fails unexpectedly', async () => {
    const copilotAdapter = createCopilotAdapterStub();
    copilotAdapter.probeAuth.mockRejectedValue(new Error('timed out'));

    registerIpc(
      {
        load: vi.fn().mockResolvedValue({
          selectedModel: null,
          recentDrawings: [],
          lastDrawingPath: null,
          windowBounds: null,
          lastKnownModels: []
        }),
        save: vi.fn()
      } as never,
      copilotAdapter
    );

    const loadBootstrap = handlers.get(ipcChannels.loadBootstrap);
    const bootstrap = await loadBootstrap?.({}, undefined);

    expect(bootstrap).toMatchObject({
      authState: 'checking'
    });
  });

  it('ignores bootstrap override environment variables outside explicit e2e mode', async () => {
    process.env.CAD_UI_E2E_AUTH_STATE = 'ready';
    process.env.CAD_UI_E2E_MODELS = 'override-model';

    const copilotAdapter = createCopilotAdapterStub();
    copilotAdapter.listModels.mockResolvedValue(['gpt-5.4-live']);
    copilotAdapter.probeAuth.mockResolvedValue('reauth-required');

    registerIpc(
      {
        load: vi.fn().mockResolvedValue({
          selectedModel: null,
          recentDrawings: [],
          lastDrawingPath: null,
          windowBounds: null,
          lastKnownModels: []
        }),
        save: vi.fn()
      } as never,
      copilotAdapter
    );

    const loadBootstrap = handlers.get(ipcChannels.loadBootstrap);
    const bootstrap = await loadBootstrap?.({}, undefined);

    expect(bootstrap).toEqual({
      authState: 'reauth-required',
      models: ['gpt-5.4-live'],
      settings: {
        selectedModel: null,
        recentDrawings: [],
        lastDrawingPath: null,
        windowBounds: null,
        lastKnownModels: ['gpt-5.4-live']
      }
    });
  });

  it('honors bootstrap override environment variables in explicit e2e mode', async () => {
    process.env.CAD_UI_E2E = '1';
    process.env.CAD_UI_E2E_AUTH_STATE = 'ready';
    process.env.CAD_UI_E2E_MODELS = 'override-model,override-model-mini';

    const copilotAdapter = createCopilotAdapterStub();

    registerIpc(
      {
        load: vi.fn().mockResolvedValue({
          selectedModel: null,
          recentDrawings: [],
          lastDrawingPath: null,
          windowBounds: null,
          lastKnownModels: []
        }),
        save: vi.fn()
      } as never,
      copilotAdapter
    );

    const loadBootstrap = handlers.get(ipcChannels.loadBootstrap);
    const bootstrap = await loadBootstrap?.({}, undefined);

    expect(bootstrap).toEqual({
      authState: 'ready',
      models: ['override-model', 'override-model-mini'],
      settings: {
        selectedModel: null,
        recentDrawings: [],
        lastDrawingPath: null,
        windowBounds: null,
        lastKnownModels: ['override-model', 'override-model-mini']
      }
    });
    expect(copilotAdapter.listModels).not.toHaveBeenCalled();
    expect(copilotAdapter.probeAuth).not.toHaveBeenCalled();
  });

  it('returns a controlled prompt error for non-auth CLI failures', async () => {
    const copilotAdapter = createCopilotAdapterStub();
    copilotAdapter.runPrompt.mockRejectedValue({
      code: 'ETIMEDOUT',
      message: 'Command timed out',
      stderr: ''
    });

    registerIpc(
      {
        load: vi.fn().mockResolvedValue({
          selectedModel: null,
          recentDrawings: [],
          lastDrawingPath: null,
          windowBounds: null,
          lastKnownModels: []
        }),
        save: vi.fn()
      } as never,
      copilotAdapter
    );

    const sendPrompt = handlers.get(ipcChannels.sendPrompt);
    const response = await sendPrompt?.({}, {
      model: 'gpt-5.4',
      prompt: 'Summarize the drawing.',
      drawingPath: null,
      selectedEntityIds: [],
      selectedEntityHandles: []
    });

    expect(response).toMatchObject({
      text: 'Copilot CLI prompt failed.'
    });

    const listDiagnostics = handlers.get(ipcChannels.listDiagnostics);
    expect(listDiagnostics?.({}, undefined)).toMatchObject([
      {
        source: 'copilot',
        level: 'error',
        message: 'Prompt execution failed.',
        detail: null
      }
    ]);
  });

  it('returns structured highlight data when the prompt response includes a JSON envelope', async () => {
    const copilotAdapter = createCopilotAdapterStub();
    copilotAdapter.runPrompt.mockResolvedValue(`Here is the result:\n\n\
\`\`\`json
{"text":"Driveway boundary highlighted.","featureIds":["driveway-1"],"entityHandles":["3D"],"highlightMode":"outline","evidence":[{"featureId":"driveway-1","handle":"3D","source":"cadq feature"}]}
\`\`\``);

    registerIpc(
      {
        load: vi.fn().mockResolvedValue({
          selectedModel: null,
          recentDrawings: [],
          lastDrawingPath: null,
          windowBounds: null,
          lastKnownModels: []
        }),
        save: vi.fn()
      } as never,
      copilotAdapter
    );

    const sendPrompt = handlers.get(ipcChannels.sendPrompt);
    const response = await sendPrompt?.({}, {
      model: 'gpt-5.4',
      prompt: 'Highlight the driveway boundary.',
      drawingPath: 'D:/drawings/site.dxf',
      selectedEntityIds: ['entity-line-1'],
      selectedEntityHandles: ['A1']
    });

    expect(response).toEqual({
      text: 'Driveway boundary highlighted.',
      featureIds: ['driveway-1'],
      entityHandles: ['3D'],
      highlightMode: 'outline',
      evidence: [
        {
          featureId: 'driveway-1',
          handle: '3D',
          source: 'cadq feature'
        }
      ]
    });
  });

  it('preserves evidence for feature-only envelopes when top-level entity handles are absent', async () => {
    const copilotAdapter = createCopilotAdapterStub();
    copilotAdapter.runPrompt.mockResolvedValue(`Here is the result:\n\n\
\`\`\`json
{"text":"Frontage feature highlighted.","featureIds":["frontage-feature"],"entityHandles":[],"highlightMode":"focus","evidence":[{"featureId":"frontage-feature","handle":"A1","source":"cadq feature"}]}
\`\`\``);

    registerIpc(
      {
        load: vi.fn().mockResolvedValue({
          selectedModel: null,
          recentDrawings: [],
          lastDrawingPath: null,
          windowBounds: null,
          lastKnownModels: []
        }),
        save: vi.fn()
      } as never,
      copilotAdapter
    );

    const sendPrompt = handlers.get(ipcChannels.sendPrompt);
    const response = await sendPrompt?.({}, {
      model: 'gpt-5.4',
      prompt: 'Highlight the frontage feature.',
      drawingPath: 'D:/drawings/site.dxf',
      selectedEntityIds: ['entity-line-1'],
      selectedEntityHandles: ['A1']
    });

    expect(response).toEqual({
      text: 'Frontage feature highlighted.',
      featureIds: ['frontage-feature'],
      entityHandles: [],
      highlightMode: 'focus',
      evidence: [
        {
          featureId: 'frontage-feature',
          handle: 'A1',
          source: 'cadq feature'
        }
      ]
    });
  });

  it('does not reuse selected entity ids as semantic feature ids for plain-text prompt replies', async () => {
    const copilotAdapter = createCopilotAdapterStub();
    copilotAdapter.runPrompt.mockResolvedValue('The same geometry remains in focus.');

    registerIpc(
      {
        load: vi.fn().mockResolvedValue({
          selectedModel: null,
          recentDrawings: [],
          lastDrawingPath: null,
          windowBounds: null,
          lastKnownModels: []
        }),
        save: vi.fn()
      } as never,
      copilotAdapter
    );

    const sendPrompt = handlers.get(ipcChannels.sendPrompt);
    const response = await sendPrompt?.({}, {
      model: 'gpt-5.4',
      prompt: 'Keep the same geometry in focus.',
      drawingPath: 'D:/drawings/site.dxf',
      selectedEntityIds: ['entity-line-1'],
      selectedEntityHandles: ['A1']
    });

    expect(response).toEqual({
      text: 'The same geometry remains in focus.',
      featureIds: [],
      entityHandles: ['A1'],
      highlightMode: 'focus',
      evidence: []
    });
  });

  it('points the model at the CAD_AI cadq CLI and includes the cache path plus chat history in the prompt', async () => {
    const copilotAdapter = createCopilotAdapterStub();
    copilotAdapter.runPrompt.mockResolvedValue('Counted 3 trees via cadq.');

    registerIpc(
      {
        load: vi.fn().mockResolvedValue({
          selectedModel: null,
          recentDrawings: [],
          lastDrawingPath: null,
          windowBounds: null,
          lastKnownModels: []
        }),
        save: vi.fn()
      } as never,
      copilotAdapter
    );

    const sendPrompt = handlers.get(ipcChannels.sendPrompt);
    await sendPrompt?.({}, {
      model: 'gpt-5.4',
      prompt: 'How many trees?',
      drawingPath: 'D:/drawings/site.dwg',
      cachePath: 'D:/drawings/site.dwg.cadqcache',
      selectedEntityIds: [],
      selectedEntityHandles: [],
      chatHistory: [
        { role: 'user', text: 'What area of trees is there?' },
        { role: 'assistant', text: 'About 42 m^2.' }
      ]
    });

    expect(copilotAdapter.runPrompt).toHaveBeenCalledTimes(1);
    const promptText = copilotAdapter.runPrompt.mock.calls[0][1] as string;
    expect(promptText).toContain('cadq');
    expect(promptText).toContain('D:/drawings/site.dwg.cadqcache');
    expect(promptText).toContain('D:/drawings/site.dwg');
    expect(promptText).toContain('User: What area of trees is there?');
    expect(promptText).toContain('Assistant: About 42 m^2.');
    expect(promptText).toContain('How many trees?');
    expect(promptText).not.toContain('Drawing summary:');
  });

  it('omits the conversation block when no chat history exists yet', async () => {
    const copilotAdapter = createCopilotAdapterStub();
    copilotAdapter.runPrompt.mockResolvedValue('No history yet.');

    registerIpc(
      {
        load: vi.fn().mockResolvedValue({
          selectedModel: null,
          recentDrawings: [],
          lastDrawingPath: null,
          windowBounds: null,
          lastKnownModels: []
        }),
        save: vi.fn()
      } as never,
      copilotAdapter
    );

    const sendPrompt = handlers.get(ipcChannels.sendPrompt);
    await sendPrompt?.({}, {
      model: 'gpt-5.4',
      prompt: 'How many trees?',
      drawingPath: 'D:/drawings/site.dwg',
      cachePath: 'D:/drawings/site.dwg.cadqcache',
      selectedEntityIds: [],
      selectedEntityHandles: [],
      chatHistory: []
    });

    const promptText = copilotAdapter.runPrompt.mock.calls[0][1] as string;
    expect(promptText).not.toContain('Conversation so far');
    expect(promptText).toContain('How many trees?');
  });

  it('exposes a typed diagnostics list handler for renderer consumers', async () => {
    registerIpc(
      {
        load: vi.fn().mockResolvedValue({
          selectedModel: null,
          recentDrawings: [],
          lastDrawingPath: null,
          windowBounds: null,
          lastKnownModels: []
        }),
        save: vi.fn()
      } as never,
      createCopilotAdapterStub()
    );

    const listDiagnostics = handlers.get(ipcChannels.listDiagnostics);

    expect(listDiagnostics?.({}, undefined)).toEqual([]);
  });

  it('returns a structured openDrawing failure instead of rejecting the IPC call', async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({
      canceled: false,
      filePaths: ['drawing.dwg']
    } as never);

    registerIpc(
      {
        load: vi.fn().mockResolvedValue({
          selectedModel: null,
          recentDrawings: [],
          lastDrawingPath: null,
          windowBounds: null,
          lastKnownModels: []
        }),
        save: vi.fn()
      } as never,
      createCopilotAdapterStub(),
      {
        openDrawing: vi.fn().mockRejectedValue(new Error('CAD_AI ingest failed'))
      } as never
    );

    const openDrawing = handlers.get(ipcChannels.openDrawing);

    const result = await openDrawing?.({}, undefined);

    expect(result).toEqual({
      canceled: false,
      filePath: 'drawing.dwg',
      session: null,
      error: 'CAD_AI ingest failed',
      diagnostics: [
        {
          timestamp: expect.any(String),
          source: 'cad-ai',
          level: 'error',
          message: 'Failed to open drawing session for drawing.dwg',
          detail: 'CAD_AI ingest failed'
        }
      ]
    });
  });

  it('returns a viewer scene and updates recent drawings when a drawing opens successfully', async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({
      canceled: false,
      filePaths: ['tests/fixtures/site.dxf']
    } as never);

    const save = vi.fn().mockResolvedValue(undefined);

    registerIpc(
      {
        load: vi.fn().mockResolvedValue({
          selectedModel: 'gpt-5.4',
          recentDrawings: ['older.dwg'],
          lastDrawingPath: null,
          windowBounds: null,
          lastKnownModels: []
        }),
        save
      } as never,
      createCopilotAdapterStub(),
      {
        openDrawing: vi.fn().mockResolvedValue({
          sourcePath: 'tests/fixtures/site.dxf',
          dxfPath: 'tests/fixtures/site.dxf',
          cachePath: 'tests/fixtures/.cadqcache',
          openedAt: '2026-05-03T12:00:00.000Z'
        })
      } as never
    );

    const openDrawing = handlers.get(ipcChannels.openDrawing);
    const result = await openDrawing?.({}, undefined);

    expect(result).toMatchObject({
      canceled: false,
      filePath: 'tests/fixtures/site.dxf',
      session: {
        sourcePath: 'tests/fixtures/site.dxf',
        dxfPath: 'tests/fixtures/site.dxf',
        cachePath: 'tests/fixtures/.cadqcache'
      },
      error: null
    });
    expect(result?.scene).toMatchObject({
      drawingPath: expect.stringContaining('tests\\fixtures\\site.dxf'),
      handleIndex: expect.objectContaining({
        B0: expect.any(String)
      })
    });
    expect(save).toHaveBeenCalledWith({
      selectedModel: 'gpt-5.4',
      recentDrawings: ['tests/fixtures/site.dxf', 'older.dwg'],
      lastDrawingPath: 'tests/fixtures/site.dxf',
      windowBounds: null,
      lastKnownModels: []
    });
  });

  it('returns cancellation without reporting an error', async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({
      canceled: true,
      filePaths: []
    } as never);

    registerIpc(
      {
        load: vi.fn().mockResolvedValue({
          selectedModel: null,
          recentDrawings: [],
          lastDrawingPath: null,
          windowBounds: null,
          lastKnownModels: []
        }),
        save: vi.fn()
      } as never,
      createCopilotAdapterStub()
    );

    const openDrawing = handlers.get(ipcChannels.openDrawing);

    await expect(openDrawing?.({}, undefined)).resolves.toEqual({
      canceled: true,
      filePath: null,
      session: null,
      error: null,
      diagnostics: []
    });
  });
});