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
    (settings.windowBounds !== null && !isWindowBounds(settings.windowBounds)) ||
    (settings.lastKnownModels !== undefined && !isStringArray(settings.lastKnownModels))
  ) {
    throw new Error('Invalid app settings payload.');
  }

  return {
    selectedModel: settings.selectedModel,
    recentDrawings: settings.recentDrawings,
    lastDrawingPath: settings.lastDrawingPath,
    windowBounds: settings.windowBounds,
    lastKnownModels: isStringArray(settings.lastKnownModels) ? settings.lastKnownModels : []
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
    (request.cachePath !== undefined && request.cachePath !== null && typeof request.cachePath !== 'string') ||
    !isStringArray(request.selectedEntityIds) ||
    (request.selectedEntityHandles !== undefined && !isStringArray(request.selectedEntityHandles)) ||
    (request.chatHistory !== undefined && !isChatHistory(request.chatHistory))
  ) {
    throw new Error('Invalid prompt request payload.');
  }

  return {
    model: request.model,
    prompt: request.prompt,
    drawingPath: request.drawingPath,
    cachePath: typeof request.cachePath === 'string' ? request.cachePath : null,
    selectedEntityIds: request.selectedEntityIds,
    selectedEntityHandles: request.selectedEntityHandles,
    chatHistory: Array.isArray(request.chatHistory) ? (request.chatHistory as SendPromptRequest['chatHistory']) : []
  };
}

function isChatHistory(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every((entry) => {
    if (typeof entry !== 'object' || entry === null) return false;
    const turn = entry as Record<string, unknown>;
    return (turn.role === 'user' || turn.role === 'assistant') && typeof turn.text === 'string';
  });
}

function parseBootstrapAuthOverride(value: string | undefined): AuthState | null {
  if (value === 'checking' || value === 'ready' || value === 'reauth-required' || value === 'cli-missing') {
    return value;
  }

  return null;
}

function isE2EBootstrapOverrideEnabled(): boolean {
  return process.env.CAD_UI_E2E === '1';
}

function readBootstrapOverrides(): { authState: AuthState | null; models: string[] | null } {
  if (!isE2EBootstrapOverrideEnabled()) {
    return {
      authState: null,
      models: null
    };
  }

  const authState = parseBootstrapAuthOverride(process.env.CAD_UI_E2E_AUTH_STATE);
  const models = process.env.CAD_UI_E2E_MODELS
    ?.split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return {
    authState,
    models: models !== undefined ? models : null
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
    const bootstrapOverrides = readBootstrapOverrides();
    const [modelsResult, authResult] = await Promise.allSettled([
      bootstrapOverrides.models === null ? copilotAdapter.listModels() : Promise.resolve(bootstrapOverrides.models),
      bootstrapOverrides.authState === null ? copilotAdapter.probeAuth() : Promise.resolve(bootstrapOverrides.authState)
    ]);

    if (modelsResult.status === 'rejected') {
      diagnosticsStore.add(
        createDiagnosticEntry('copilot', 'error', 'Model catalog discovery failed.', describeError(modelsResult.reason))
      );
    }

    if (authResult.status === 'rejected') {
      diagnosticsStore.add(
        createDiagnosticEntry('copilot', 'error', 'Copilot authentication probe failed.', describeError(authResult.reason))
      );
    }

    const liveModels = modelsResult.status === 'fulfilled' ? modelsResult.value : [];
    const cachedModels = settings.lastKnownModels;
    // Prefer the live catalog. If discovery failed (timeout, transient CLI error)
    // fall back to the cached list so the dropdown isn't empty and the user can
    // continue working with their previously selected model.
    const models = liveModels.length > 0 ? liveModels : cachedModels;
    const trustedModelCatalog = liveModels.length > 0 && isTrustworthyModelCatalog(modelsResult);
    const reconciledSettings = reconcileBootstrapSettings(
      liveModels.length > 0 ? { ...settings, lastKnownModels: liveModels } : settings,
      models,
      trustedModelCatalog
    );

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
    let diagnosticCountBeforeOpen: number | null = null;

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

      diagnosticCountBeforeOpen = diagnosticsStore.list().length;
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
      ensureOpenDrawingDiagnostic(diagnosticsStore, filePath, error, diagnosticCountBeforeOpen);

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

    return await resolvePromptEnvelope(copilotAdapter, diagnosticsStore, request, prompt);
  });
}

function describeOpenDrawingFailure(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Failed to open drawing.';
}

async function resolvePromptEnvelope(
  copilotAdapter: CopilotAdapterLike,
  diagnosticsStore: DiagnosticsStore,
  request: SendPromptRequest,
  prompt: string
): Promise<AssistantEnvelope> {
  if (prompt.length === 0) {
    return createAssistantEnvelope('Enter a prompt to begin.');
  }

  if (request.model === null) {
    return createAssistantEnvelope('Select a Copilot model before sending a prompt.');
  }

  try {
    const responseText = await copilotAdapter.runPrompt(request.model, buildPromptRequest(prompt, request));
    return parseAssistantEnvelope(responseText, request);
  } catch (error) {
    diagnosticsStore.add(createDiagnosticEntry('copilot', 'error', 'Prompt execution failed.', describeError(error)));
    return createAssistantEnvelope(describePromptFailure(error));
  }
}

function buildPromptRequest(prompt: string, request: SendPromptRequest): string {
  const selectedEntityIds = request.selectedEntityIds.length > 0 ? request.selectedEntityIds.join(', ') : 'none';
  const selectedEntityHandles = request.selectedEntityHandles?.length ? request.selectedEntityHandles.join(', ') : 'none';
  const cachePath = request.cachePath ?? 'not available';
  const drawingPath = request.drawingPath ?? 'not available';
  const history = formatChatHistory(request.chatHistory);

  const lines = [
    'You are the chat layer of CAD_UI, a desktop app for inspecting CAD drawings.',
    'CAD_AI (the sister project) has already loaded and indexed the drawing the user is looking at.',
    'You answer drawing questions by invoking the `cadq` shell command, which is the CAD_AI semantic query CLI.',
    '',
    'The active drawing context (already loaded by CAD_AI):',
    `  Source drawing: ${drawingPath}`,
    `  Cache file:     ${cachePath}`,
    '',
    'Run `cadq --help` to discover commands. Always pass `--cache <cache-file>` and `--format json` so output is machine-readable.',
    'Useful subcommands include: info, features list, area, boundary, nearest, garden, trees, layers, label, topology, elevation, plan, explain.',
    'For unfamiliar questions you can run `cadq plan "<question>"` first to get a suggested tool sequence, then execute the suggested commands.',
    'Never invent feature ids, handles, or numeric values — every fact about the drawing must come from a `cadq` invocation in this turn.',
    '',
    'Viewer context for this turn:',
    `  Currently selected entity ids: ${selectedEntityIds}`,
    `  Currently selected entity handles: ${selectedEntityHandles}`,
    ''
  ];

  if (history.length > 0) {
    lines.push('Conversation so far (oldest first):');
    lines.push(history);
    lines.push('');
  }

  lines.push('Latest user message:');
  lines.push(prompt);
  lines.push('');
  lines.push('Reply with either a natural-language answer or JSON with this schema:');
  lines.push('{"text":"string","featureIds":["semantic-feature-id"],"entityHandles":["handle"],"highlightMode":"focus|pulse|outline|zoomTo|none","evidence":[{"featureId":"semantic-feature-id","handle":"handle","source":"string"}]}');
  lines.push('When citing geometry, use stable entity handles taken from `cadq` output. Feature ids are CAD_AI semantic ids, not renderer entity ids.');

  return lines.join('\n');
}

function formatChatHistory(history: SendPromptRequest['chatHistory']): string {
  if (!Array.isArray(history) || history.length === 0) {
    return '';
  }

  // Cap to the last 10 turns so a long conversation doesn't blow the prompt budget.
  const recent = history.slice(-10);

  return recent
    .map((turn) => {
      const speaker = turn.role === 'user' ? 'User' : 'Assistant';
      return `  ${speaker}: ${turn.text.trim()}`;
    })
    .join('\n');
}

function parseAssistantEnvelope(responseText: string, request: SendPromptRequest): AssistantEnvelope {
  const parsed = tryParseAssistantEnvelope(responseText);

  if (parsed !== null) {
    return parsed;
  }

  return createAssistantEnvelope(responseText, {
    featureIds: [],
    entityHandles: request.selectedEntityHandles ?? [],
    highlightMode:
      request.selectedEntityIds.length > 0 || (request.selectedEntityHandles?.length ?? 0) > 0 ? 'focus' : 'none',
    evidence: []
  });
}

function tryParseAssistantEnvelope(responseText: string): AssistantEnvelope | null {
  const candidates = [responseText, extractJsonCodeBlock(responseText), extractJsonObject(responseText)].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  );

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const text = typeof parsed.text === 'string' ? parsed.text : responseText;
      const featureIds = isStringArray(parsed.featureIds) ? parsed.featureIds : [];
      const entityHandles = isStringArray(parsed.entityHandles) ? parsed.entityHandles : [];
      const highlightMode = isHighlightMode(parsed.highlightMode) ? parsed.highlightMode : 'none';
      const evidence = parseEvidence(parsed.evidence);

      return createAssistantEnvelope(text, {
        featureIds,
        entityHandles,
        highlightMode,
        evidence
      });
    } catch {
      continue;
    }
  }

  return null;
}

function extractJsonCodeBlock(value: string): string | null {
  const match = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match?.[1]?.trim() ?? null;
}

function extractJsonObject(value: string): string | null {
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return value.slice(start, end + 1).trim();
}

function parseEvidence(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      return [];
    }

    const record = entry as Record<string, unknown>;

    if (typeof record.featureId !== 'string' || typeof record.handle !== 'string' || typeof record.source !== 'string') {
      return [];
    }

    return [
      {
        featureId: record.featureId,
        handle: record.handle,
        source: record.source
      }
    ];
  });
}

function isHighlightMode(value: unknown): value is AssistantEnvelope['highlightMode'] {
  return value === 'focus' || value === 'pulse' || value === 'outline' || value === 'zoomTo' || value === 'none';
}

function createAssistantEnvelope(
  text: string,
  overrides: Partial<AssistantEnvelope> = {}
): AssistantEnvelope {
  return {
    text,
    featureIds: overrides.featureIds ?? [],
    entityHandles: overrides.entityHandles ?? [],
    highlightMode: overrides.highlightMode ?? 'none',
    evidence: overrides.evidence ?? []
  };
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

function describeError(error: unknown): string | null {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }

  return null;
}

function ensureOpenDrawingDiagnostic(
  diagnosticsStore: DiagnosticsStore,
  filePath: string | null,
  error: unknown,
  diagnosticCountBeforeOpen: number | null
): void {
  if (filePath === null || diagnosticCountBeforeOpen === null || diagnosticsStore.list().length > diagnosticCountBeforeOpen) {
    return;
  }

  diagnosticsStore.add(
    createDiagnosticEntry('cad-ai', 'error', `Failed to open drawing session for ${filePath}`, describeError(error))
  );
}

function createDiagnosticEntry(
  source: string,
  level: DiagnosticEntry['level'],
  message: string,
  detail: string | null
): DiagnosticEntry {
  return {
    timestamp: new Date().toISOString(),
    source,
    level,
    message,
    detail
  };
}

async function buildSceneSafely(dxfPath: string, diagnosticsStore: DiagnosticsStore) {
  try {
    return await buildSceneFromDxf(dxfPath);
  } catch (error) {
    diagnosticsStore.add(
      createDiagnosticEntry('viewer', 'error', `Failed to build viewer scene for ${dxfPath}`, describeError(error))
    );

    return null;
  }
}