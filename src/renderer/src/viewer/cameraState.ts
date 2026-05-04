import type { ViewerBounds } from '../../../shared/viewerTypes';

export type CameraState = {
  center: { x: number; y: number };
  zoom: number;
};

export type ViewportSize = {
  width: number;
  height: number;
};

export type FitOptions = {
  marginRatio: number;
};

const MIN_ZOOM = 1e-6;
const MAX_ZOOM = 1e9;

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) {
    return MIN_ZOOM;
  }

  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function fitBounds(bounds: ViewerBounds, viewport: ViewportSize, options: FitOptions): CameraState {
  const width = Math.max(bounds.maxX - bounds.minX, 1e-6);
  const height = Math.max(bounds.maxY - bounds.minY, 1e-6);
  const margin = 1 + Math.max(0, options.marginRatio);
  const viewportWidth = Math.max(viewport.width, 1);
  const viewportHeight = Math.max(viewport.height, 1);
  const zoom = Math.min(viewportWidth / (width * margin), viewportHeight / (height * margin));

  return {
    zoom: clampZoom(zoom),
    center: {
      x: bounds.minX + width / 2,
      y: bounds.minY + height / 2
    }
  };
}

export function initialCamera(bounds: ViewerBounds, viewport: ViewportSize): CameraState {
  return fitBounds(bounds, viewport, { marginRatio: 0.05 });
}

export function applyPan(
  camera: CameraState,
  delta: { dxScreen: number; dyScreen: number },
  _viewport: ViewportSize
): CameraState {
  const zoom = clampZoom(camera.zoom);

  return {
    zoom,
    center: {
      x: camera.center.x - delta.dxScreen / zoom,
      y: camera.center.y + delta.dyScreen / zoom
    }
  };
}

export function applyWheelZoom(
  camera: CameraState,
  event: { screenX: number; screenY: number; deltaY: number },
  viewport: ViewportSize
): CameraState {
  const factor = Math.exp(-event.deltaY * 0.0015);
  const nextZoom = clampZoom(camera.zoom * factor);
  const worldBefore = screenToWorld(camera, viewport, { x: event.screenX, y: event.screenY });
  const candidate: CameraState = { zoom: nextZoom, center: camera.center };
  const worldAfter = screenToWorld(candidate, viewport, { x: event.screenX, y: event.screenY });

  return {
    zoom: nextZoom,
    center: {
      x: camera.center.x + (worldBefore.x - worldAfter.x),
      y: camera.center.y + (worldBefore.y - worldAfter.y)
    }
  };
}

export function screenToWorld(
  camera: CameraState,
  viewport: ViewportSize,
  point: { x: number; y: number }
): { x: number; y: number } {
  const zoom = clampZoom(camera.zoom);

  return {
    x: camera.center.x + (point.x - viewport.width / 2) / zoom,
    y: camera.center.y - (point.y - viewport.height / 2) / zoom
  };
}

export function viewBoxFor(camera: CameraState, viewport: ViewportSize): {
  minX: number;
  minY: number;
  width: number;
  height: number;
} {
  const zoom = clampZoom(camera.zoom);
  const width = Math.max(viewport.width, 1) / zoom;
  const height = Math.max(viewport.height, 1) / zoom;

  return {
    minX: camera.center.x - width / 2,
    minY: camera.center.y - height / 2,
    width,
    height
  };
}

export function boundsForEntityIds(
  scene: { entities: Array<{ id: string; bounds: ViewerBounds | null }> } | null,
  entityIds: string[]
): ViewerBounds | null {
  if (scene === null || entityIds.length === 0) {
    return null;
  }

  const targets = new Set(entityIds);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let found = false;

  for (const entity of scene.entities) {
    if (!targets.has(entity.id) || entity.bounds === null) {
      continue;
    }

    const { bounds } = entity;
    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
    found = true;
  }

  if (!found) {
    return null;
  }

  return { minX, minY, maxX, maxY };
}
