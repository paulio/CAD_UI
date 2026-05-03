import { useState } from 'react';
import type {
  AppSettings,
  AssistantEnvelope,
  BootstrapData,
  DiagnosticEntry,
  DrawingSession,
  HighlightMode
} from '../../../shared/contracts';
import type { ViewerEntity, ViewerHighlight, ViewerScene } from '../../../shared/viewerTypes';

export type ChatTranscriptEntry = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  featureIds: string[];
  entityHandles: string[];
  highlightMode: HighlightMode;
};

export type AppStoreState = {
  bootstrap: BootstrapData | null;
  bootstrapFailed: boolean;
  diagnostics: DiagnosticEntry[];
  session: DrawingSession | null;
  scene: ViewerScene | null;
  openDrawingError: string | null;
  highlight: ViewerHighlight;
  selectedEntityId: string | null;
  prompt: string;
  transcript: ChatTranscriptEntry[];
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
  bootstrap: null,
  bootstrapFailed: false,
  diagnostics: [],
  session: null,
  scene: null,
  openDrawingError: null,
  highlight: {
    featureIds: [],
    entityHandles: [],
    mode: 'none'
  },
  selectedEntityId: null,
  prompt: '',
  transcript: [],
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
        bootstrap,
        bootstrapFailed: false,
        diagnostics,
        openDrawingError: null
      }));
    } catch {
      setState((current) => ({
        ...current,
        bootstrap: null,
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
      ...(state.bootstrap?.settings ?? defaultSettings),
      selectedModel: model
    };

    setState((current) => ({
      ...current,
      bootstrap:
        current.bootstrap === null
          ? current.bootstrap
          : {
              ...current.bootstrap,
              settings: nextSettings
            }
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
        session: result.session,
        scene: result.scene ?? null,
        diagnostics: result.diagnostics,
        openDrawingError: result.error,
        highlight: {
          featureIds: [],
          entityHandles: [],
          mode: 'none'
        },
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
      transcript: userEntry === null ? current.transcript : [...current.transcript, userEntry]
    }));

    try {
      const response = await window.cadUiApi.sendPrompt({
        model: state.bootstrap?.settings.selectedModel ?? null,
        prompt,
        drawingPath: state.session?.sourcePath ?? null,
        selectedEntityIds: state.selectedEntityId === null ? [] : [state.selectedEntityId]
      });

      const nextHighlight = {
        featureIds: response.featureIds,
        entityHandles: response.entityHandles,
        mode: response.highlightMode
      } satisfies ViewerHighlight;
      const highlightedEntityIds = resolveHighlightedEntityIds(state.scene, response);

      setState((current) => ({
        ...current,
        isSendingPrompt: false,
        prompt: '',
        transcript: [...current.transcript, createAssistantEntry(response)],
        highlight: nextHighlight,
        selectedEntityId: highlightedEntityIds[0] ?? current.selectedEntityId,
        diagnostics: current.diagnostics
      }));
    } catch {
      setState((current) => ({
        ...current,
        isSendingPrompt: false,
        transcript: [
          ...current.transcript,
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
      highlight: {
        featureIds,
        entityHandles,
        mode
      },
      selectedEntityId: highlightedEntityIds[0] ?? current.selectedEntityId
    }));
  }

  function selectEntity(entityId: string): void {
    const entity = findEntityById(state.scene, entityId);

    setState((current) => ({
      ...current,
      selectedEntityId: entityId,
      highlight: {
        featureIds: [entityId],
        entityHandles: entity?.handle === null || entity?.handle === undefined ? [] : [entity.handle],
        mode: 'outline'
      }
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

function createAssistantEntry(response: AssistantEnvelope): ChatTranscriptEntry {
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