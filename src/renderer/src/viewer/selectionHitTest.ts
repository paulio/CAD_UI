import type { ViewerBounds } from '../../../shared/viewerTypes';

export type SelectMode = 'window' | 'crossing';

export type SelectionLayerState = {
  visible: boolean;
  locked: boolean;
};

export type SelectableEntity = {
  id: string;
  layer: string;
  bounds: ViewerBounds | null;
};

export type SelectInBoxOptions = {
  mode: SelectMode;
  layerVisibility: Record<string, SelectionLayerState>;
};

export function selectInBox(
  entities: ReadonlyArray<SelectableEntity>,
  box: ViewerBounds,
  options: SelectInBoxOptions
): string[] {
  return entities
    .filter((entity) => {
      if (entity.bounds === null) return false;
      const layer = options.layerVisibility[entity.layer];
      if (layer && (!layer.visible || layer.locked)) return false;

      return options.mode === 'window'
        ? isContained(entity.bounds, box)
        : intersects(entity.bounds, box);
    })
    .map((entity) => entity.id);
}

export function normalizeBox(start: { x: number; y: number }, end: { x: number; y: number }): ViewerBounds {
  return {
    minX: Math.min(start.x, end.x),
    minY: Math.min(start.y, end.y),
    maxX: Math.max(start.x, end.x),
    maxY: Math.max(start.y, end.y)
  };
}

export function selectModeForDrag(start: { x: number; y: number }, end: { x: number; y: number }): SelectMode {
  return end.x >= start.x ? 'window' : 'crossing';
}

function isContained(inner: ViewerBounds, outer: ViewerBounds): boolean {
  return (
    inner.minX >= outer.minX &&
    inner.maxX <= outer.maxX &&
    inner.minY >= outer.minY &&
    inner.maxY <= outer.maxY
  );
}

function intersects(a: ViewerBounds, b: ViewerBounds): boolean {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}
