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
  const authState = state.bootstrapFailed ? 'bootstrap error' : state.authState;
  const selectedModelLabel = state.bootstrapFailed ? 'Unavailable' : state.selectedModel ?? 'Not selected';
  const openDisabled = !state.bootstrapLoaded || state.bootstrapFailed || state.isOpeningDrawing;

  return (
    <main className="app-shell">
      <TopBar
        authState={authState}
        drawingPath={state.drawingSession?.sourcePath ?? null}
        models={state.models}
        selectedModel={state.selectedModel}
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
          messages={state.messages}
          prompt={state.prompt}
          disabled={state.bootstrapFailed || state.drawingSession === null}
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
            highlightedEntityIds={state.highlightedEntityIds}
            highlightMode={state.highlightMode}
            selectedEntityId={state.selectedEntityId}
            showSurveyPoints={state.showSurveyPoints}
            onSelectEntity={actions.selectEntity}
            onToggleSurveyPoints={actions.setShowSurveyPoints}
          />
          <DiagnosticsPanel diagnostics={state.diagnostics} />
        </div>
        <FeatureInspector entity={selectedEntity} />
      </section>
    </main>
  );
}