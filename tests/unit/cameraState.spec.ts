import { describe, expect, it } from 'vitest';
import {
  applyPan,
  applyWheelZoom,
  boundsForEntityIds,
  fitBounds,
  initialCamera,
  screenToWorld,
  viewBoxFor
} from '../../src/renderer/src/viewer/cameraState';

describe('cameraState', () => {
  it('fits target bounds into the viewport with the requested margin', () => {
    const camera = fitBounds({ minX: 0, minY: 0, maxX: 100, maxY: 50 }, { width: 400, height: 200 }, { marginRatio: 0.1 });

    expect(camera.center.x).toBeCloseTo(50, 5);
    expect(camera.center.y).toBeCloseTo(25, 5);
    // viewport=400 wide, world=100*1.1=110 → zoom = 400/110 ≈ 3.636
    expect(camera.zoom).toBeCloseTo(400 / 110, 5);
  });

  it('initialCamera centers on the bounds with a small default margin', () => {
    const camera = initialCamera({ minX: -10, minY: -10, maxX: 10, maxY: 10 }, { width: 200, height: 200 });

    expect(camera.center).toEqual({ x: 0, y: 0 });
    expect(camera.zoom).toBeGreaterThan(0);
  });

  it('translates the camera by screen-pixel deltas during pan, accounting for zoom and y-flip', () => {
    const camera = { center: { x: 50, y: 50 }, zoom: 2 };
    const panned = applyPan(camera, { dxScreen: 10, dyScreen: -20 }, { width: 200, height: 200 });

    expect(panned.center.x).toBeCloseTo(50 - 10 / 2, 5);
    expect(panned.center.y).toBeCloseTo(50 + -20 / 2, 5);
    expect(panned.zoom).toBe(2);
  });

  it('keeps the cursor world point stationary while wheel-zooming in', () => {
    const camera = initialCamera({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, { width: 200, height: 200 });
    const viewport = { width: 200, height: 200 };
    const cursor = { screenX: 50, screenY: 150 };

    const worldBefore = screenToWorld(camera, viewport, { x: cursor.screenX, y: cursor.screenY });
    const zoomed = applyWheelZoom(camera, { ...cursor, deltaY: -200 }, viewport);
    const worldAfter = screenToWorld(zoomed, viewport, { x: cursor.screenX, y: cursor.screenY });

    expect(zoomed.zoom).toBeGreaterThan(camera.zoom);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 5);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 5);
  });

  it('zooms out when wheel deltaY is positive and clamps to a positive zoom', () => {
    const camera = { center: { x: 0, y: 0 }, zoom: 1 };
    const zoomed = applyWheelZoom(camera, { screenX: 100, screenY: 100, deltaY: 5000 }, { width: 200, height: 200 });

    expect(zoomed.zoom).toBeGreaterThan(0);
    expect(zoomed.zoom).toBeLessThan(camera.zoom);
  });

  it('viewBoxFor produces a viewBox sized inversely to zoom', () => {
    const camera = { center: { x: 100, y: 100 }, zoom: 4 };
    const viewBox = viewBoxFor(camera, { width: 800, height: 400 });

    expect(viewBox.width).toBeCloseTo(200, 5);
    expect(viewBox.height).toBeCloseTo(100, 5);
    expect(viewBox.minX).toBeCloseTo(0, 5);
    expect(viewBox.minY).toBeCloseTo(50, 5);
  });

  it('boundsForEntityIds aggregates per-entity bounds for the requested ids', () => {
    const scene = {
      entities: [
        { id: 'a', bounds: { minX: 0, minY: 0, maxX: 5, maxY: 5 } },
        { id: 'b', bounds: { minX: 10, minY: -2, maxX: 12, maxY: 4 } },
        { id: 'c', bounds: { minX: 100, minY: 100, maxX: 200, maxY: 200 } }
      ]
    };

    expect(boundsForEntityIds(scene, ['a', 'b'])).toEqual({ minX: 0, minY: -2, maxX: 12, maxY: 5 });
    expect(boundsForEntityIds(scene, [])).toBeNull();
    expect(boundsForEntityIds(null, ['a'])).toBeNull();
  });
});
