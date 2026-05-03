import { dialog, ipcMain } from 'electron';
import type {
  AppSettings,
  AssistantEnvelope,
  BootstrapData,
  SendPromptRequest
} from '../../shared/contracts';
import { ipcChannels } from '../../shared/contracts';
import { SettingsStore } from '../services/settingsStore';

function registerHandler<TReturn>(
  channel: string,
  handler: (payload: unknown) => Promise<TReturn> | TReturn
): void {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, (_event, payload) => handler(payload));
}

export function registerIpc(settingsStore: SettingsStore): void {
  registerHandler<AppSettings>(ipcChannels.loadSettings, () => settingsStore.load());

  registerHandler<void>(ipcChannels.saveSettings, async (payload) => {
    await settingsStore.save(payload as AppSettings);
  });

  registerHandler<BootstrapData>(ipcChannels.loadBootstrap, async () => ({
    authState: 'checking',
    models: [],
    settings: await settingsStore.load()
  }));

  registerHandler(ipcChannels.openDrawing, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        {
          name: 'CAD drawings',
          extensions: ['dwg', 'dxf']
        }
      ]
    });

    const filePath = result.canceled ? null : result.filePaths[0] ?? null;

    if (filePath !== null) {
      const settings = await settingsStore.load();
      const recentDrawings = [filePath, ...settings.recentDrawings.filter((entry) => entry !== filePath)].slice(0, 10);

      await settingsStore.save({
        ...settings,
        recentDrawings,
        lastDrawingPath: filePath
      });
    }

    return {
      canceled: result.canceled,
      filePath
    };
  });

  registerHandler<AssistantEnvelope>(ipcChannels.sendPrompt, async (_payload: unknown) => {
    const request = _payload as SendPromptRequest;

    return {
      text: request.prompt.trim().length > 0 ? 'Prompt handling is not implemented yet.' : 'Enter a prompt to begin.',
      featureIds: [],
      entityHandles: [],
      highlightMode: 'none',
      evidence: []
    };
  });
}