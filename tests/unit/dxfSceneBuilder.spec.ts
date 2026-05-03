import { describe, expect, it } from 'vitest';
import { buildHighlightSet, buildSceneFromDxf } from '../../src/main/adapters/viewer/dxfSceneBuilder';

describe('buildSceneFromDxf', () => {
  it('creates viewer-ready primitives, bounds, and handle indexes', async () => {
    const scene = await buildSceneFromDxf('tests/fixtures/site.dxf');

    expect(scene.entities.length).toBeGreaterThan(0);
    expect(scene.handleIndex).toHaveProperty('9C');
    expect(scene.bounds).not.toBeNull();
    expect(scene.bounds?.maxX).toBeGreaterThan(scene.bounds?.minX ?? 0);
  });

  it('maps CAD_AI handles to stable viewer entity ids', async () => {
    const scene = await buildSceneFromDxf('tests/fixtures/site.dxf');

    expect(buildHighlightSet(scene, ['9c', 'missing-handle'])).toEqual([scene.handleIndex['9C']]);
  });
});