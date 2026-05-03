import { useEffect } from 'react';
import './styles.css';
import { ChatPanel } from './components/ChatPanel';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { DrawingCanvas } from './components/DrawingCanvas';
import { FeatureInspector } from './components/FeatureInspector';
import { TopBar } from './components/TopBar';
import { useAppStore } from './store/useAppStore';

export function App() {
  const { state, actions } = useAppStore();

  useEffect(() => {
    void actions.loadBootstrap();
  }, []);

  const selectedEntity = state.scene?.entities.find((entity) => entity.id === state.selectedEntityId) ?? null;
  const authState = state.bootstrapFailed ? 'bootstrap error' : state.bootstrap?.authState ?? 'unavailable';
  const selectedModelLabel = state.bootstrapFailed
    ? 'Unavailable'
    : state.bootstrap?.settings.selectedModel ?? 'Not selected';
  const openDisabled = state.bootstrap === null || state.bootstrapFailed || state.isOpeningDrawing;

  return (
    <main className="app-shell">
      <TopBar
        authState={authState}
        drawingPath={state.session?.sourcePath ?? null}
        models={state.bootstrap?.models ?? []}
        selectedModel={state.bootstrap?.settings.selectedModel ?? null}
        openDisabled={openDisabled}
        isOpeningDrawing={state.isOpeningDrawing}
        onOpenDrawing={() => {
          void actions.openDrawing();
        }}
        onModelChange={(model) => {
          void actions.selectModel(model);
        }}
      />
      <section className="app-status" aria-label="application status">
        <p>AI status: {authState}</p>
        <p>Selected model: {selectedModelLabel}</p>
        {state.openDrawingError === null ? null : <p role="alert">{state.openDrawingError}</p>}
        {state.bootstrapFailed ? <p role="alert">Failed to load application settings. Running in a safe fallback state.</p> : null}
      </section>
      <section className="app-layout">
        <ChatPanel
          transcript={state.transcript}
          prompt={state.prompt}
          disabled={state.bootstrapFailed || state.session === null}
          sending={state.isSendingPrompt}
          onPromptChange={actions.updatePrompt}
          onSendPrompt={() => {
            void actions.sendPrompt();
          }}
          onFocusFeatures={actions.focusFeatures}
        />
        <div className="center-column">
          <DrawingCanvas
            scene={state.scene}
            highlight={state.highlight}
            selectedEntityId={state.selectedEntityId}
            onSelectEntity={actions.selectEntity}
          />
          <DiagnosticsPanel diagnostics={state.diagnostics} />
        </div>
        <FeatureInspector entity={selectedEntity} />
      </section>
    </main>
  );
}