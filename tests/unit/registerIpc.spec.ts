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
  });

  it('rejects malformed settings payloads with a controlled error', async () => {
    const save = vi.fn();

    registerIpc({
      load: vi.fn().mockResolvedValue({
        selectedModel: null,
        recentDrawings: [],
        lastDrawingPath: null,
        windowBounds: null
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
        windowBounds: null
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
      }
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
        windowBounds: null
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
        windowBounds: null
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
        windowBounds: null
      }
    });
    expect(files).not.toContain('register-ipc-settings.json');
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
          windowBounds: null
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
        windowBounds: null
      }
    });
    expect(save).toHaveBeenCalledWith({
      selectedModel: 'gpt-5.4',
      recentDrawings: [],
      lastDrawingPath: null,
      windowBounds: null
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
          windowBounds: null
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
        windowBounds: null
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
          windowBounds: null
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
          windowBounds: null
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
          windowBounds: null
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
          windowBounds: null
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
          windowBounds: null
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

  it('exposes a typed diagnostics list handler for renderer consumers', async () => {
    registerIpc(
      {
        load: vi.fn().mockResolvedValue({
          selectedModel: null,
          recentDrawings: [],
          lastDrawingPath: null,
          windowBounds: null
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
          windowBounds: null
        }),
        save: vi.fn()
      } as never,
      createCopilotAdapterStub(),
      {
        openDrawing: vi.fn().mockRejectedValue(new Error('CAD_AI ingest failed'))
      } as never
    );

    const openDrawing = handlers.get(ipcChannels.openDrawing);

    await expect(openDrawing?.({}, undefined)).resolves.toEqual({
      canceled: false,
      filePath: 'drawing.dwg',
      session: null,
      error: 'CAD_AI ingest failed',
      diagnostics: []
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
          windowBounds: null
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
      windowBounds: null
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
          windowBounds: null
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