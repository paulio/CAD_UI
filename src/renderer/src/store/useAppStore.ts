import { useState } from 'react';
import type {
  AuthState,
  AppSettings,
  AssistantEnvelope,
  DiagnosticEntry,
  DrawingSession,
  HighlightMode
} from '../../../shared/contracts';
import type { EntityHandle } from '../../../shared/contracts';
import type { ViewerEntity, ViewerScene } from '../../../shared/viewerTypes';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  featureIds: string[];
  entityHandles: string[];
  highlightMode: HighlightMode;
};

export type AppStoreState = {
  authState: AuthState | 'unavailable';
  models: string[];
  selectedModel: string | null;
  drawingSession: DrawingSession | null;
  scene: ViewerScene | null;
  highlightedEntityIds: string[];
  messages: ChatMessage[];
  settings: AppSettings;
  bootstrapLoaded: boolean;
  bootstrapFailed: boolean;
  diagnostics: DiagnosticEntry[];
  openDrawingError: string | null;
  selectedEntityId: string | null;
  prompt: string;
  isOpeningDrawing: boolean;
  isSendingPrompt: boolean;
};

type AppStore = {
  state: AppStoreState;
  actions: {
    loadBootstrap: () => Promise<void>;
    updatePrompt: (prompt: string) => void;
    selectModel: (model: string) => Promise<void>;
    openDrawing: () => Promise<void>;
    sendPrompt: () => Promise<void>;
    focusFeatures: (featureIds: string[], entityHandles: string[], mode: HighlightMode) => void;
    selectEntity: (entityId: string) => void;
  };
};

const defaultSettings: AppSettings = {
  selectedModel: null,
  recentDrawings: [],
  lastDrawingPath: null,
  windowBounds: null
};

const initialState: AppStoreState = {
  authState: 'unavailable',
  models: [],
  selectedModel: null,
  drawingSession: null,
  scene: null,
  highlightedEntityIds: [],
  messages: [],
  settings: defaultSettings,
  bootstrapLoaded: false,
  bootstrapFailed: false,
  diagnostics: [],
  openDrawingError: null,
  selectedEntityId: null,
  prompt: '',
  isOpeningDrawing: false,
  isSendingPrompt: false
};

export function useAppStore(): AppStore {
  const [state, setState] = useState<AppStoreState>(initialState);

  async function loadBootstrap(): Promise<void> {
    if (typeof window === 'undefined' || typeof window.cadUiApi?.loadBootstrap !== 'function') {
      return;
    }

    try {
      const bootstrap = await window.cadUiApi.loadBootstrap();
      const diagnostics = await loadDiagnosticsSafely();

      setState((current) => ({
        ...current,
        authState: bootstrap.authState,
        models: bootstrap.models,
        selectedModel: bootstrap.settings.selectedModel,
        settings: bootstrap.settings,
        bootstrapLoaded: true,
        bootstrapFailed: false,
        diagnostics,
        openDrawingError: null
      }));
    } catch {
      setState((current) => ({
        ...current,
        authState: 'unavailable',
        models: [],
        selectedModel: null,
        settings: defaultSettings,
        bootstrapLoaded: true,
        bootstrapFailed: true,
        diagnostics: []
      }));
    }
  }

  function updatePrompt(prompt: string): void {
    setState((current) => ({
      ...current,
      prompt
    }));
  }

  async function selectModel(model: string): Promise<void> {
    const nextSettings = {
      ...state.settings,
      selectedModel: model
    };

    setState((current) => ({
      ...current,
      settings: nextSettings,
      selectedModel: model
    }));

    if (typeof window === 'undefined' || typeof window.cadUiApi?.saveSettings !== 'function') {
      return;
    }

    try {
      await window.cadUiApi.saveSettings(nextSettings);
    } catch {
      setState((current) => ({
        ...current,
        openDrawingError: 'Failed to persist the selected Copilot model.'
      }));
    }
  }

  async function openDrawing(): Promise<void> {
    if (typeof window === 'undefined' || typeof window.cadUiApi?.openDrawing !== 'function') {
      return;
    }

    setState((current) => ({
      ...current,
      isOpeningDrawing: true,
      openDrawingError: null
    }));

    try {
      const result = await window.cadUiApi.openDrawing();

      if (result.canceled) {
        setState((current) => ({
          ...current,
          isOpeningDrawing: false
        }));
        return;
      }

      setState((current) => ({
        ...current,
        isOpeningDrawing: false,
        drawingSession: result.session,
        scene: result.scene ?? null,
        diagnostics: result.diagnostics,
        openDrawingError: result.error,
        highlightedEntityIds: [],
        selectedEntityId: null
      }));
    } catch {
      setState((current) => ({
        ...current,
        isOpeningDrawing: false,
        openDrawingError: 'Failed to open the selected drawing.'
      }));
    }
  }

  async function sendPrompt(): Promise<void> {
    if (typeof window === 'undefined' || typeof window.cadUiApi?.sendPrompt !== 'function' || state.isSendingPrompt) {
      return;
    }

    const prompt = state.prompt.trim();
    const userEntry =
      prompt.length > 0
        ? {
            id: createEntryId('user'),
            role: 'user' as const,
            text: prompt,
            featureIds: [],
            entityHandles: [],
            highlightMode: 'none' as const
          }
        : null;

    setState((current) => ({
      ...current,
      isSendingPrompt: true,
      messages: userEntry === null ? current.messages : [...current.messages, userEntry]
    }));

    try {
      const selectedEntityHandles = resolveEntityHandles(state.scene, state.highlightedEntityIds);
      const response = await window.cadUiApi.sendPrompt({
        model: state.selectedModel,
        prompt,
        drawingPath: state.drawingSession?.sourcePath ?? null,
        selectedEntityIds: state.highlightedEntityIds,
        selectedEntityHandles
      });

      const highlightedEntityIds = resolveHighlightedEntityIds(state.scene, response);

      setState((current) => ({
        ...current,
        isSendingPrompt: false,
        prompt: '',
        messages: [...current.messages, createAssistantEntry(response)],
        highlightedEntityIds,
        selectedEntityId: highlightedEntityIds[0] ?? current.selectedEntityId,
        diagnostics: current.diagnostics
      }));
    } catch {
      setState((current) => ({
        ...current,
        isSendingPrompt: false,
        messages: [
          ...current.messages,
          {
            id: createEntryId('assistant'),
            role: 'assistant',
            text: 'Prompt delivery failed before the renderer received a response.',
            featureIds: [],
            entityHandles: [],
            highlightMode: 'none'
          }
        ]
      }));
    }
  }

  function focusFeatures(featureIds: string[], entityHandles: string[], mode: HighlightMode): void {
    const highlightedEntityIds = resolveEntityIds(state.scene, featureIds, entityHandles);

    setState((current) => ({
      ...current,
      highlightedEntityIds,
      selectedEntityId: highlightedEntityIds[0] ?? current.selectedEntityId
    }));
  }

  function selectEntity(entityId: string): void {
    const entity = findEntityById(state.scene, entityId);

    setState((current) => ({
      ...current,
      selectedEntityId: entityId,
      highlightedEntityIds: entity === null ? [entityId] : resolveEntityIds(current.scene, [entityId], entity.handle === null ? [] : [entity.handle])
    }));
  }

  return {
    state,
    actions: {
      loadBootstrap,
      updatePrompt,
      selectModel,
      openDrawing,
      sendPrompt,
      focusFeatures,
      selectEntity
    }
  };
}

async function loadDiagnosticsSafely(): Promise<DiagnosticEntry[]> {
  if (typeof window === 'undefined' || typeof window.cadUiApi?.listDiagnostics !== 'function') {
    return [];
  }

  try {
    return await window.cadUiApi.listDiagnostics();
  } catch {
    return [];
  }
}

function createAssistantEntry(response: AssistantEnvelope): ChatMessage {
  return {
    id: createEntryId('assistant'),
    role: 'assistant',
    text: response.text,
    featureIds: response.featureIds,
    entityHandles: response.entityHandles,
    highlightMode: response.highlightMode
  };
}

function createEntryId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function resolveHighlightedEntityIds(scene: ViewerScene | null, response: AssistantEnvelope): string[] {
  return resolveEntityIds(scene, response.featureIds, response.entityHandles);
}

function resolveEntityIds(scene: ViewerScene | null, featureIds: string[], entityHandles: string[]): string[] {
  if (scene === null) {
    return [];
  }

  const entityIds = [...featureIds];

  for (const handle of entityHandles) {
    const entityId = scene.handleIndex[handle];

    if (typeof entityId === 'string' && !entityIds.includes(entityId)) {
      entityIds.push(entityId);
    }
  }

  return entityIds;
}

function findEntityById(scene: ViewerScene | null, entityId: string): ViewerEntity | null {
  if (scene === null) {
    return null;
  }

  return scene.entities.find((entity) => entity.id === entityId) ?? null;
}

function resolveEntityHandles(scene: ViewerScene | null, entityIds: string[]): EntityHandle[] {
  if (scene === null) {
    return [];
  }

  const handles: EntityHandle[] = [];

  for (const entityId of entityIds) {
    const entity = findEntityById(scene, entityId);

    if (entity?.handle !== null && entity?.handle !== undefined && !handles.includes(entity.handle)) {
      handles.push(entity.handle);
    }
  }

  return handles;
}