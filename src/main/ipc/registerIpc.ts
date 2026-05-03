import { dialog, ipcMain } from 'electron';
import type {
  AppSettings,
  AssistantEnvelope,
  BootstrapData,
  WindowBounds,
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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isWindowBounds(value: unknown): value is WindowBounds {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const bounds = value as Record<string, unknown>;

  return typeof bounds.width === 'number' && typeof bounds.height === 'number';
}

function parseAppSettings(payload: unknown): AppSettings {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('Invalid app settings payload.');
  }

  const settings = payload as Record<string, unknown>;

  if (
    (settings.selectedModel !== null && typeof settings.selectedModel !== 'string') ||
    !isStringArray(settings.recentDrawings) ||
    (settings.lastDrawingPath !== null && typeof settings.lastDrawingPath !== 'string') ||
    (settings.windowBounds !== null && !isWindowBounds(settings.windowBounds))
  ) {
    throw new Error('Invalid app settings payload.');
  }

  return {
    selectedModel: settings.selectedModel,
    recentDrawings: settings.recentDrawings,
    lastDrawingPath: settings.lastDrawingPath,
    windowBounds: settings.windowBounds
  };
}

function parseSendPromptRequest(payload: unknown): SendPromptRequest {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('Invalid prompt request payload.');
  }

  const request = payload as Record<string, unknown>;

  if (
    (request.model !== null && typeof request.model !== 'string') ||
    typeof request.prompt !== 'string' ||
    (request.drawingPath !== null && typeof request.drawingPath !== 'string') ||
    !isStringArray(request.selectedEntityIds)
  ) {
    throw new Error('Invalid prompt request payload.');
  }

  return {
    model: request.model,
    prompt: request.prompt,
    drawingPath: request.drawingPath,
    selectedEntityIds: request.selectedEntityIds
  };
}

export function registerIpc(settingsStore: SettingsStore): void {
  registerHandler<AppSettings>(ipcChannels.loadSettings, () => settingsStore.load());

  registerHandler<void>(ipcChannels.saveSettings, async (payload) => {
    await settingsStore.save(parseAppSettings(payload));
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
    const request = parseSendPromptRequest(_payload);

    return {
      text: request.prompt.trim().length > 0 ? 'Prompt handling is not implemented yet.' : 'Enter a prompt to begin.',
      featureIds: [],
      entityHandles: [],
      highlightMode: 'none',
      evidence: []
    };
  });
}