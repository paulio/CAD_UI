import { dialog, ipcMain } from 'electron';
import type {
  AppSettings,
  AssistantEnvelope,
  BootstrapData,
  AuthState,
  DiagnosticEntry,
  OpenDrawingResult,
  WindowBounds,
  SendPromptRequest
} from '../../shared/contracts';
import { ipcChannels } from '../../shared/contracts';
import { DrawingSessionService } from '../adapters/cadAi/drawingSessionService';
import { CopilotAdapter } from '../adapters/copilot/copilotAdapter';
import { classifyCopilotFailure } from '../adapters/copilot/modelCatalog';
import { buildSceneFromDxf } from '../adapters/viewer/dxfSceneBuilder';
import { DiagnosticsStore } from '../services/diagnosticsStore';
import { SettingsStore } from '../services/settingsStore';

type CopilotAdapterLike = Pick<CopilotAdapter, 'listModels' | 'probeAuth' | 'runPrompt'>;
type DrawingSessionServiceLike = Pick<DrawingSessionService, 'openDrawing'>;

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
  copilotAdapter: CopilotAdapterLike = new CopilotAdapter(),
  drawingSessionService?: DrawingSessionServiceLike
): void {
  const diagnosticsStore = new DiagnosticsStore();
  let cachedDrawingSessionService = drawingSessionService;

  function getDrawingSessionService(): DrawingSessionServiceLike {
    if (cachedDrawingSessionService === undefined) {
      cachedDrawingSessionService = new DrawingSessionService({
        diagnostics: diagnosticsStore
      });
    }

    return cachedDrawingSessionService;
  }

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
    const models = modelsResult.status === 'fulfilled' ? modelsResult.value : [];
    const reconciledSettings = reconcileBootstrapSettings(settings, models, isTrustworthyModelCatalog(modelsResult));

    if (reconciledSettings !== settings) {
      await settingsStore.save(reconciledSettings);
    }

    return {
      authState: authResult.status === 'fulfilled' ? authResult.value : 'checking',
      models,
      settings: reconciledSettings
    };
  });

  registerHandler<DiagnosticEntry[]>(ipcChannels.listDiagnostics, () => diagnosticsStore.list());

  registerHandler<OpenDrawingResult>(ipcChannels.openDrawing, async () => {
    let filePath: string | null = null;

    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          {
            name: 'CAD drawings',
            extensions: ['dwg', 'dxf']
          }
        ]
      });

      filePath = result.canceled ? null : result.filePaths[0] ?? null;

      if (filePath === null) {
        return {
          canceled: result.canceled,
          filePath: null,
          session: null,
          error: null,
          diagnostics: diagnosticsStore.list()
        };
      }

      const session = await getDrawingSessionService().openDrawing(filePath);
      const scene = session.dxfPath === null ? null : await buildSceneSafely(session.dxfPath, diagnosticsStore);
      const settings = await settingsStore.load();
      const recentDrawings = [filePath, ...settings.recentDrawings.filter((entry) => entry !== filePath)].slice(0, 10);

      await settingsStore.save({
        ...settings,
        recentDrawings,
        lastDrawingPath: filePath
      });

      return {
        canceled: false,
        filePath,
        session,
        scene,
        error: scene === null && session.dxfPath !== null ? `Failed to build a viewer scene for ${session.dxfPath}.` : null,
        diagnostics: diagnosticsStore.list()
      };
    } catch (error) {
      return {
        canceled: false,
        filePath,
        session: null,
        error: describeOpenDrawingFailure(error),
        diagnostics: diagnosticsStore.list()
      };
    }
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

function describeOpenDrawingFailure(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Failed to open drawing.';
}

async function resolvePromptText(
  copilotAdapter: CopilotAdapterLike,
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
  const stdout = extractStringProperty(error, 'stdout');
  const errorCode = extractStringProperty(error, 'code');
  const authState = classifyPromptFailure({ message, stderr, stdout, errorCode });

  if (authState === 'reauth-required') {
    return 'Copilot CLI is not authenticated. Run copilot login and try again.';
  }

  if (authState === 'cli-missing') {
    return 'Copilot CLI is unavailable. Install it or add it to PATH and try again.';
  }

  return 'Copilot CLI prompt failed.';
}

function classifyPromptFailure(input: { message: string; stderr: string; stdout: string; errorCode: string }): AuthState {
  return classifyCopilotFailure({
    exitCode: null,
    stderr: [input.message, input.stderr].filter((value) => value.length > 0).join('\n'),
    stdout: input.stdout,
    errorCode: input.errorCode
  });
}

function reconcileBootstrapSettings(settings: AppSettings, models: string[], canReconcile: boolean): AppSettings {
  if (!canReconcile || settings.selectedModel === null) {
    return settings;
  }

  if (models.includes(settings.selectedModel)) {
    return settings;
  }

  return {
    ...settings,
    selectedModel: models[0] ?? null
  };
}

function isTrustworthyModelCatalog(result: PromiseSettledResult<string[]>): boolean {
  return result.status === 'fulfilled' && result.value.length > 0;
}

function extractStringProperty(value: unknown, key: string): string {
  if (typeof value !== 'object' || value === null) {
    return '';
  }

  const record = value as Record<string, unknown>;
  return typeof record[key] === 'string' ? record[key] : '';
}

async function buildSceneSafely(dxfPath: string, diagnosticsStore: DiagnosticsStore) {
  try {
    return await buildSceneFromDxf(dxfPath);
  } catch (error) {
    diagnosticsStore.add({
      timestamp: new Date().toISOString(),
      source: 'viewer',
      level: 'error',
      message: `Failed to build viewer scene for ${dxfPath}`,
      detail: error instanceof Error ? error.message : String(error)
    });

    return null;
  }
}