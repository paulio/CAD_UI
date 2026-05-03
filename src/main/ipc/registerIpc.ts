import { dialog, ipcMain } from 'electron';
import type {
  AppSettings,
  AssistantEnvelope,
  BootstrapData,
  AuthState,
  WindowBounds,
  SendPromptRequest
} from '../../shared/contracts';
import { ipcChannels } from '../../shared/contracts';
import { CopilotAdapter } from '../adapters/copilot/copilotAdapter';
import { SettingsStore } from '../services/settingsStore';

type CopilotAdapterLike = Pick<CopilotAdapter, 'listModels' | 'probeAuth' | 'runPrompt'>;

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

export function registerIpc(
  settingsStore: SettingsStore,
  copilotAdapter: CopilotAdapterLike = new CopilotAdapter()
): void {

  registerHandler<AppSettings>(ipcChannels.loadSettings, () => settingsStore.load());

  registerHandler<void>(ipcChannels.saveSettings, async (payload) => {
    await settingsStore.save(parseAppSettings(payload));
  });

  registerHandler<BootstrapData>(ipcChannels.loadBootstrap, async () => {
    const settings = await settingsStore.load();
    const [modelsResult, authResult] = await Promise.allSettled([
      copilotAdapter.listModels(),
      copilotAdapter.probeAuth()
    ]);

    return {
      authState: authResult.status === 'fulfilled' ? authResult.value : 'cli-missing',
      models: modelsResult.status === 'fulfilled' ? modelsResult.value : [],
      settings
    };
  });

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
    const prompt = request.prompt.trim();

    return {
      text: await resolvePromptText(copilotAdapter, request, prompt),
      featureIds: [],
      entityHandles: [],
      highlightMode: 'none',
      evidence: []
    };
  });
}

async function resolvePromptText(
  copilotAdapter: CopilotAdapter,
  request: SendPromptRequest,
  prompt: string
): Promise<string> {
  if (prompt.length === 0) {
    return 'Enter a prompt to begin.';
  }

  if (request.model === null) {
    return 'Select a Copilot model before sending a prompt.';
  }

  try {
    return await copilotAdapter.runPrompt(request.model, prompt);
  } catch (error) {
    return describePromptFailure(error);
  }
}

function describePromptFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const stderr = extractStringProperty(error, 'stderr');
  const errorCode = extractStringProperty(error, 'code');
  const authState = classifyPromptFailure({ message, stderr, errorCode });

  if (authState === 'reauth-required') {
    return 'Copilot CLI is not authenticated. Run copilot login and try again.';
  }

  if (authState === 'cli-missing') {
    return 'Copilot CLI is unavailable. Install it or add it to PATH and try again.';
  }

  return 'Copilot CLI prompt failed.';
}

function classifyPromptFailure(input: { message: string; stderr: string; errorCode: string }): AuthState {
  const diagnostic = [input.message, input.stderr].join('\n');

  if (input.errorCode.toUpperCase() === 'ENOENT') {
    return 'cli-missing';
  }

  if (/copilot login|log[ -]?in|authenticate|authentication|credential|token|sign[ -]?in/i.test(diagnostic)) {
    return 'reauth-required';
  }

  return 'cli-missing';
}

function extractStringProperty(value: unknown, key: string): string {
  if (typeof value !== 'object' || value === null) {
    return '';
  }

  const record = value as Record<string, unknown>;
  return typeof record[key] === 'string' ? record[key] : '';
}