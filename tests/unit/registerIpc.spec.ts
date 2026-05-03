import { describe, expect, it, vi } from 'vitest';

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

import { registerIpc } from '../../src/main/ipc/registerIpc';
import { ipcChannels } from '../../src/shared/contracts';

describe('registerIpc', () => {
  it('rejects malformed prompt requests with a controlled error', async () => {
    registerIpc({
      load: vi.fn().mockResolvedValue({
        selectedModel: null,
        recentDrawings: [],
        lastDrawingPath: null,
        windowBounds: null
      }),
      save: vi.fn()
    } as never);

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
    } as never);

    const sendPrompt = handlers.get(ipcChannels.sendPrompt);
    const response = await sendPrompt?.(
      {},
      {
        model: null,
        prompt: '   ',
        drawingPath: null,
        selectedEntityIds: []
      }
    );

    expect(response).toMatchObject({
      text: 'Enter a prompt to begin.'
    });
  });
});