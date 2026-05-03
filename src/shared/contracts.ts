export type WindowBounds = {
  width: number;
  height: number;
};

export type AppSettings = {
  selectedModel: string | null;
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
  models: string[];
  settings: AppSettings;
};

export type OpenDrawingResult = {
  canceled: boolean;
  filePath: string | null;
};

export type SendPromptRequest = {
  model: string | null;
  prompt: string;
  drawingPath: string | null;
  selectedEntityIds: string[];
};

export interface CadUiApi {
  loadSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  loadBootstrap: () => Promise<BootstrapData>;
  openDrawing: () => Promise<OpenDrawingResult>;
  sendPrompt: (request: SendPromptRequest) => Promise<AssistantEnvelope>;
}

export const ipcChannels = {
  loadSettings: 'settings:load',
  saveSettings: 'settings:save',
  loadBootstrap: 'app:bootstrap',
  openDrawing: 'drawing:open',
  sendPrompt: 'prompt:send'
} as const;