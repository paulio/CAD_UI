import { useState } from 'react';
import type {
  AuthState,
  AppSettings,
  AssistantEnvelope,
  AssistantEvidence,
  DiagnosticEntry,
  DrawingSession,
  HighlightMode
} from '../../../shared/contracts';
import type { EntityHandle } from '../../../shared/contracts';
import type { ViewerEntity, ViewerLayer, ViewerScene } from '../../../shared/viewerTypes';

export type LayerStateMap = Record<string, { visible: boolean; locked: boolean }>;

export type LayerChange =
  | { id: string; patch: { visible: boolean } }
  | { id: string; patch: { locked: boolean } }
  | { id: string; patch: { isolate: true } }
  | { patch: { showAll: true } };

export type ChatReplayTarget = {
  id: string;
  label: string;
  featureIds: string[];
  entityHandles: EntityHandle[];
  entityIds: string[];
  evidence: AssistantEvidence[];
  highlightMode: HighlightMode;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  featureIds: string[];
  entityHandles: string[];
  highlightMode: HighlightMode;
  replayTargets: ChatReplayTarget[];
};

export type AppStoreState = {
  authState: AuthState | 'unavailable';
  models: string[];
  selectedModel: string | null;
  drawingSession: DrawingSession | null;
  scene: ViewerScene | null;
  highlightedFeatureIds: string[];
  highlightedEntityIds: string[];
  highlightedEntityHandles: EntityHandle[];
  highlightMode: HighlightMode;
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
  showSurveyPoints: boolean;
  layerState: LayerStateMap;
};

type AppStore = {
  state: AppStoreState;
  actions: {
    loadBootstrap: () => Promise<void>;
    updatePrompt: (prompt: string) => void;
    selectModel: (model: string) => Promise<void>;
    openDrawing: () => Promise<void>;
    sendPrompt: () => Promise<void>;
    focusFeatures: (target: ChatReplayTarget) => void;
    selectEntity: (entityId: string) => void;
    setShowSurveyPoints: (next: boolean) => void;
    applyLayerChange: (change: LayerChange) => void;
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
  highlightedFeatureIds: [],
  highlightedEntityIds: [],
  highlightedEntityHandles: [],
  highlightMode: 'none',
  messages: [],
  settings: defaultSettings,
  bootstrapLoaded: false,
  bootstrapFailed: false,
  diagnostics: [],
  openDrawingError: null,
  selectedEntityId: null,
  prompt: '',
  isOpeningDrawing: false,
  isSendingPrompt: false,
  showSurveyPoints: false,
  layerState: {}
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

      setState((current) => {
        const nextSettings = result.filePath === null ? current.settings : applyOpenedDrawingToSettings(current.settings, result.filePath);

        return {
          ...current,
          isOpeningDrawing: false,
          drawingSession: result.session,
          scene: result.scene ?? null,
          diagnostics: result.diagnostics,
          openDrawingError: result.error,
          settings: nextSettings,
          layerState: result.scene ? defaultLayerState(result.scene.layers) : {},
          ...emptyHighlightState(),
          selectedEntityId: null
        };
      });
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
            highlightMode: 'none' as const,
            replayTargets: []
          }
        : null;

    setState((current) => ({
      ...current,
      isSendingPrompt: true,
      messages: userEntry === null ? current.messages : [...current.messages, userEntry]
    }));

    try {
      const selectedEntityHandles = state.highlightedEntityHandles;
      const response = await window.cadUiApi.sendPrompt({
        model: state.selectedModel,
        prompt,
        drawingPath: state.drawingSession?.sourcePath ?? null,
        selectedEntityIds: state.highlightedEntityIds,
        selectedEntityHandles
      });
      const diagnostics = await loadDiagnosticsSafely();

      const nextHighlight = createHighlightState(state.scene, {
        featureIds: response.featureIds,
        entityHandles: response.entityHandles,
        evidence: response.evidence,
        highlightMode: response.highlightMode
      });
      const assistantEntry = createAssistantEntry(response, state.scene);

      setState((current) => ({
        ...current,
        isSendingPrompt: false,
        prompt: '',
        messages: [...current.messages, assistantEntry],
        ...nextHighlight,
        selectedEntityId: nextHighlight.highlightedEntityIds[0] ?? current.selectedEntityId,
        diagnostics
      }));
    } catch {
      const diagnostics = await loadDiagnosticsSafely();

      setState((current) => ({
        ...current,
        isSendingPrompt: false,
        diagnostics,
        messages: [
          ...current.messages,
          {
            id: createEntryId('assistant'),
            role: 'assistant',
            text: 'Prompt delivery failed before the renderer received a response.',
            featureIds: [],
            entityHandles: [],
            highlightMode: 'none',
            replayTargets: []
          }
        ]
      }));
    }
  }

  function focusFeatures(target: ChatReplayTarget): void {
    const nextHighlight = createHighlightState(state.scene, {
      featureIds: target.featureIds,
      entityHandles: target.entityHandles,
      entityIds: target.entityIds,
      evidence: target.evidence,
      highlightMode: target.highlightMode
    });

    setState((current) => ({
      ...current,
      ...nextHighlight,
      selectedEntityId: nextHighlight.highlightedEntityIds[0] ?? current.selectedEntityId
    }));
  }

  function selectEntity(entityId: string): void {
    const entity = findEntityById(state.scene, entityId);
    const nextHighlight = createHighlightState(state.scene, {
      featureIds: [],
      entityHandles: entity?.handle === null || entity?.handle === undefined ? [] : [entity.handle],
      entityIds: [entityId],
      highlightMode: 'focus'
    });

    setState((current) => ({
      ...current,
      selectedEntityId: entityId,
      ...nextHighlight
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
      selectEntity,
      setShowSurveyPoints: (next: boolean) =>
        setState((current) => ({
          ...current,
          showSurveyPoints: next
        })),
      applyLayerChange: (change: LayerChange) =>
        setState((current) => ({
          ...current,
          layerState: applyLayerChange(current.scene?.layers ?? [], current.layerState, change)
        }))
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

function createAssistantEntry(response: AssistantEnvelope, scene: ViewerScene | null): ChatMessage {
  return {
    id: createEntryId('assistant'),
    role: 'assistant',
    text: response.text,
    featureIds: response.featureIds,
    entityHandles: collectEnvelopeHandles(response),
    highlightMode: response.highlightMode,
    replayTargets: buildReplayTargets(scene, response)
  };
}

function createEntryId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function emptyHighlightState() {
  return {
    highlightedFeatureIds: [],
    highlightedEntityIds: [],
    highlightedEntityHandles: [],
    highlightMode: 'none' as const
  };
}

function createHighlightState(
  scene: ViewerScene | null,
  input: {
    featureIds: string[];
    entityHandles: string[];
    entityIds?: string[];
    evidence?: AssistantEvidence[];
    highlightMode: HighlightMode;
  }
) {
  const highlightedFeatureIds = uniqueStrings(input.featureIds);
  const highlightedEntityHandles = normalizeEntityHandles([
    ...input.entityHandles,
    ...resolveEvidenceHandles(highlightedFeatureIds, input.evidence ?? [])
  ]);
  const highlightedEntityIds = uniqueStrings([
    ...(input.entityIds ?? []),
    ...resolveEntityIdsFromHandles(scene, highlightedEntityHandles)
  ]);

  return {
    highlightedFeatureIds,
    highlightedEntityIds,
    highlightedEntityHandles,
    highlightMode: input.highlightMode
  };
}

function buildReplayTargets(scene: ViewerScene | null, response: AssistantEnvelope): ChatReplayTarget[] {
  const featureIds = uniqueStrings(response.featureIds);
  const envelopeHandles = collectEnvelopeHandles(response);
  const featureTargets = featureIds.flatMap((featureId) => {
    const featureEvidence = response.evidence.filter((record) => record.featureId === featureId);
    const handles = resolveEvidenceHandles([featureId], featureEvidence);
    const scopedHandles = handles.length > 0 ? handles : featureIds.length === 1 ? envelopeHandles : [];

    if (scopedHandles.length === 0) {
      return [];
    }

    return [
      {
        id: `feature-${featureId}`,
        label: `Focus feature ${featureId}`,
        featureIds: [featureId],
        entityHandles: scopedHandles,
        entityIds: resolveEntityIdsFromHandles(scene, scopedHandles),
        evidence: featureEvidence,
        highlightMode: response.highlightMode
      }
    ];
  });

  if (featureTargets.length > 0) {
    return featureTargets;
  }

  if (envelopeHandles.length === 0) {
    return [];
  }

  return [
    {
      id: 'reply-linked-geometry',
      label: 'Focus linked geometry',
      featureIds: [],
      entityHandles: envelopeHandles,
      entityIds: resolveEntityIdsFromHandles(scene, envelopeHandles),
      evidence: response.evidence,
      highlightMode: response.highlightMode
    }
  ];
}

function resolveEvidenceHandles(featureIds: string[], evidence: AssistantEvidence[]): EntityHandle[] {
  if (featureIds.length === 0 || evidence.length === 0) {
    return [];
  }

  return normalizeEntityHandles(
    evidence.filter((record) => featureIds.includes(record.featureId)).map((record) => record.handle)
  );
}

function resolveEntityIdsFromHandles(scene: ViewerScene | null, entityHandles: string[]): string[] {
  if (scene === null) {
    return [];
  }

  const entityIds: string[] = [];

  for (const handle of normalizeEntityHandles(entityHandles)) {
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

  return normalizeEntityHandles(handles);
}

function collectEnvelopeHandles(response: AssistantEnvelope): EntityHandle[] {
  return normalizeEntityHandles([...response.entityHandles, ...response.evidence.map((record) => record.handle)]);
}

function normalizeEntityHandles(handles: string[]): EntityHandle[] {
  return uniqueStrings(handles.map(normalizeHandle).filter((handle): handle is EntityHandle => handle.length > 0));
}

function normalizeHandle(handle: string): EntityHandle {
  return handle.trim().toUpperCase();
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index) => value.length > 0 && values.indexOf(value) === index);
}

function applyOpenedDrawingToSettings(settings: AppSettings, filePath: string): AppSettings {
  return {
    ...settings,
    recentDrawings: [filePath, ...settings.recentDrawings.filter((entry) => entry !== filePath)].slice(0, 10),
    lastDrawingPath: filePath
  };
}

export function defaultLayerState(layers: ViewerLayer[] | undefined | null): LayerStateMap {
  if (!Array.isArray(layers)) {
    return {};
  }

  return layers.reduce<LayerStateMap>((accumulator, layer) => {
    accumulator[layer.id] = { visible: layer.visible, locked: layer.locked };
    return accumulator;
  }, {});
}

export function applyLayerChange(layers: ViewerLayer[] | undefined | null, state: LayerStateMap, change: LayerChange): LayerStateMap {
  const safeLayers = Array.isArray(layers) ? layers : [];
  const merged = safeLayers.reduce<LayerStateMap>((accumulator, layer) => {
    accumulator[layer.id] = state[layer.id] ?? { visible: layer.visible, locked: layer.locked };
    return accumulator;
  }, {});

  if ('patch' in change && 'showAll' in change.patch) {
    return Object.fromEntries(
      Object.entries(merged).map(([id, current]) => [id, { ...current, visible: true }])
    );
  }

  if ('id' in change) {
    const current = merged[change.id] ?? { visible: true, locked: false };

    if ('isolate' in change.patch) {
      return Object.fromEntries(
        Object.entries(merged).map(([id, entry]) => [
          id,
          { ...entry, visible: id === change.id }
        ])
      );
    }

    if ('visible' in change.patch) {
      return { ...merged, [change.id]: { ...current, visible: change.patch.visible } };
    }

    if ('locked' in change.patch) {
      return { ...merged, [change.id]: { ...current, locked: change.patch.locked } };
    }
  }

  return merged;
}