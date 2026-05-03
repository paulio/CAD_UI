import type { AuthState, ModelId } from '../../../shared/contracts';

type TopBarProps = {
  authState: AuthState | 'unavailable' | 'bootstrap error';
  drawingPath: string | null;
  models: ModelId[];
  selectedModel: ModelId | null;
  openDisabled: boolean;
  isOpeningDrawing: boolean;
  onOpenDrawing: () => void;
  onModelChange: (model: string) => void;
};

export function TopBar(props: TopBarProps) {
  const drawingLabel = props.drawingPath === null ? 'No drawing loaded' : readFileLabel(props.drawingPath);

  return (
    <header className="top-bar">
      <div>
        <h1>CAD UI</h1>
        <p className="top-bar__subtitle">Renderer shell for drawing chat, diagnostics, and geometry focus.</p>
      </div>
      <div className="top-bar__controls">
        <div className="top-bar__meta">
          <span className="top-bar__label">Current file</span>
          <strong>{drawingLabel}</strong>
        </div>
        <label className="top-bar__field">
          <span>Copilot model</span>
          <select
            aria-label="Copilot model"
            value={props.selectedModel ?? ''}
            onChange={(event) => props.onModelChange(event.target.value)}
            disabled={props.models.length === 0}
          >
            {props.selectedModel === null ? <option value="">Select a model</option> : null}
            {props.models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
        <div className="top-bar__meta">
          <span className="top-bar__label">AI status</span>
          <strong>{props.authState}</strong>
        </div>
        <button type="button" onClick={props.onOpenDrawing} disabled={props.openDisabled}>
          {props.isOpeningDrawing ? 'Opening...' : 'Open DWG'}
        </button>
      </div>
    </header>
  );
}

function readFileLabel(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] ?? filePath;
}