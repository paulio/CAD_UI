import type { ViewerLayer } from '../../../shared/viewerTypes';

export type LayerStateMap = Record<string, { visible: boolean; locked: boolean }>;

type LayerPanelChange =
  | { id: string; patch: { visible: boolean } }
  | { id: string; patch: { locked: boolean } }
  | { id: string; patch: { isolate: true } }
  | { patch: { showAll: true } };

type LayerPanelProps = {
  layers: ViewerLayer[];
  layerState: LayerStateMap;
  onChange: (change: LayerPanelChange) => void;
};

export function LayerPanel({ layers, layerState, onChange }: LayerPanelProps) {
  if (layers.length === 0) {
    return null;
  }

  return (
    <aside className="layer-panel" aria-label="Layers">
      <div className="layer-panel__header">
        <h2>Layers</h2>
        <button
          type="button"
          className="layer-panel__show-all"
          onClick={() => onChange({ patch: { showAll: true } })}
        >
          Show all
        </button>
      </div>
      <ul className="layer-panel__list">
        {layers.map((layer) => {
          const merged = mergeLayer(layer, layerState[layer.id]);

          return (
            <li
              key={layer.id}
              className={merged.visible ? 'layer-panel__item' : 'layer-panel__item layer-panel__item--hidden'}
            >
              <input
                type="checkbox"
                aria-label={`${layer.id} visible`}
                checked={merged.visible}
                onChange={(event) => onChange({ id: layer.id, patch: { visible: event.target.checked } })}
              />
              <span
                className="layer-panel__color"
                style={{ background: layer.color ?? '#56717e' }}
                aria-hidden="true"
              />
              <span className="layer-panel__name" title={layer.id}>
                {layer.id}
              </span>
              <span className="layer-panel__count" aria-label={`${layer.entityCount} entities`}>
                {layer.entityCount}
              </span>
              <button
                type="button"
                className="layer-panel__lock"
                aria-label={`${merged.locked ? 'Unlock' : 'Lock'} ${layer.id}`}
                aria-pressed={merged.locked}
                onClick={() => onChange({ id: layer.id, patch: { locked: !merged.locked } })}
              >
                {merged.locked ? 'Locked' : 'Unlocked'}
              </button>
              <button
                type="button"
                className="layer-panel__isolate"
                aria-label={`Isolate ${layer.id}`}
                onClick={() => onChange({ id: layer.id, patch: { isolate: true } })}
              >
                Isolate
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function mergeLayer(layer: ViewerLayer, state: LayerStateMap[string] | undefined): { visible: boolean; locked: boolean } {
  if (state === undefined) {
    return { visible: layer.visible, locked: layer.locked };
  }

  return state;
}
