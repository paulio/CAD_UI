export type WindowBounds = {
  width: number;
  height: number;
};

export type ModelId = string;

export type AppSettings = {
  selectedModel: ModelId | null;
  recentDrawings: string[];
  lastDrawingPath: string | null;
  windowBounds: WindowBounds | null;
};

export type AuthState = 'checking' | 'ready' | 'reauth-required' | 'cli-missing';

export type HighlightMode = 'focus' | 'pulse' | 'outline' | 'zoomTo' | 'none';

export type AssistantEvidence = {
  featureId: string;
  handle: string;
  source: string;
};

export type AssistantEnvelope = {
  text: string;
  featureIds: string[];
  entityHandles: string[];
  highlightMode: HighlightMode;
  evidence: AssistantEvidence[];
};

export type BootstrapData = {
  authState: AuthState;
  models: ModelId[];
  settings: AppSettings;
};

export type DiagnosticLevel = 'info' | 'error';

export type DiagnosticEntry = {
  timestamp: string;
  source: string;
  level: DiagnosticLevel;
  message: string;
  detail: string | null;
};

export type DrawingSession = {
  sourcePath: string;
  dxfPath: string | null;
  cachePath: string;
  openedAt: string;
};

export type OpenDrawingResult = {
  canceled: boolean;
  filePath: string | null;
  session: DrawingSession | null;
  error: string | null;
  diagnostics: DiagnosticEntry[];
};

export type SendPromptRequest = {
  model: ModelId | null;
  prompt: string;
  drawingPath: string | null;
  selectedEntityIds: string[];
};

export interface CadUiApi {
  loadSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  loadBootstrap: () => Promise<BootstrapData>;
  listDiagnostics: () => Promise<DiagnosticEntry[]>;
  openDrawing: () => Promise<OpenDrawingResult>;
  sendPrompt: (request: SendPromptRequest) => Promise<AssistantEnvelope>;
}

export const ipcChannels = {
  loadSettings: 'settings:load',
  saveSettings: 'settings:save',
  loadBootstrap: 'app:bootstrap',
  listDiagnostics: 'diagnostics:list',
  openDrawing: 'drawing:open',
  sendPrompt: 'prompt:send'
} as const;