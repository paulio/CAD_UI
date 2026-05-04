import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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

    expect(buildHighlightSet(scene, ['9c', 'b0', 'missing-handle'])).toEqual([
      scene.handleIndex['9C'],
      scene.handleIndex['B0']
    ]);
  });

  it('normalizes INSERT entities from the fixture into handle-indexed viewer entities', async () => {
    const scene = await buildSceneFromDxf('tests/fixtures/site.dxf');
    const treeInsert = scene.entities.find((entity) => entity.handle === 'B0');
    const manholeInsert = scene.entities.find((entity) => entity.handle === 'B2');

    expect(treeInsert).toMatchObject({
      id: scene.handleIndex.B0,
      kind: 'insert',
      handle: 'B0',
      layer: 'L-PLNT-TREE',
      x: 15,
      y: 5,
      name: 'TREE-OAK'
    });
    expect(manholeInsert).toMatchObject({
      id: scene.handleIndex.B2,
      kind: 'insert',
      handle: 'B2',
      layer: 'L-DRAIN-MH',
      x: 22,
      y: 18,
      name: 'MH-CIRC'
    });
    expect(treeInsert?.bounds).toEqual({
      minX: 15,
      minY: 5,
      maxX: 15,
      maxY: 5
    });
  });

  it('preserves bulge metadata and computes bulge-aware bounds for curved polylines', async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), 'cad-ui-dxf-'));
    const dxfPath = join(tempDirectory, 'bulge-polyline.dxf');

    try {
      await writeFile(dxfPath, createBulgePolylineDxf(), 'utf8');

      const scene = await buildSceneFromDxf(dxfPath);
      const polyline = scene.entities[0];

      expect(polyline).toMatchObject({
        kind: 'polyline',
        handle: '10',
        closed: false,
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 }
        ],
        vertices: [
          { x: 0, y: 0, bulge: 1 },
          { x: 10, y: 0, bulge: 0 }
        ]
      });
      expect(polyline?.bounds).toEqual({
        minX: 0,
        minY: -5,
        maxX: 10,
        maxY: 0
      });
      expect(scene.bounds).toEqual(polyline?.bounds ?? null);
    } finally {
      await rm(tempDirectory, { force: true, recursive: true });
    }
  });

  it('computes wraparound arc bounds from normalized radian angles', async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), 'cad-ui-dxf-'));
    const dxfPath = join(tempDirectory, 'wraparound-arc.dxf');

    try {
      await writeFile(dxfPath, createWraparoundArcDxf(), 'utf8');

      const scene = await buildSceneFromDxf(dxfPath);
      const arc = scene.entities[0];

      expect(arc).toMatchObject({
        kind: 'arc',
        handle: '11'
      });
      expect(arc?.bounds).toEqual({
        minX: 0,
        minY: 0,
        maxX: 10,
        maxY: 10
      });
    } finally {
      await rm(tempDirectory, { force: true, recursive: true });
    }
  });

  it('keeps unsupported entities in the scene and handle index when fallback points exist', async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), 'cad-ui-dxf-'));
    const dxfPath = join(tempDirectory, 'unsupported-spline.dxf');

    try {
      await writeFile(dxfPath, createUnsupportedSplineDxf(), 'utf8');

      const scene = await buildSceneFromDxf(dxfPath);
      const spline = scene.entities[0];

      expect(spline).toMatchObject({
        kind: 'unknown',
        handle: '20',
        label: 'SPLINE',
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 5 },
          { x: 10, y: 0 }
        ]
      });
      expect(scene.handleIndex['20']).toBe(spline?.id);
      expect(buildHighlightSet(scene, ['20'])).toEqual([spline?.id]);
    } finally {
      await rm(tempDirectory, { force: true, recursive: true });
    }
  });

  it('builds a layer index with default visibility, lock, and per-layer entity counts', async () => {
    const scene = await buildSceneFromDxf('tests/fixtures/site.dxf');

    expect(Array.isArray(scene.layers)).toBe(true);
    expect(scene.layers.length).toBeGreaterThan(0);

    const treeLayer = scene.layers.find((layer) => layer.id === 'L-PLNT-TREE');
    expect(treeLayer).toBeDefined();
    expect(treeLayer?.visible).toBe(true);
    expect(treeLayer?.locked).toBe(false);
    expect(treeLayer?.entityCount).toBeGreaterThan(0);

    const totalCount = scene.layers.reduce((sum, layer) => sum + layer.entityCount, 0);
    expect(totalCount).toBe(scene.entities.length);
  });
});

function createBulgePolylineDxf(): string {
  return [
    '0',
    'SECTION',
    '2',
    'ENTITIES',
    '0',
    'LWPOLYLINE',
    '5',
    '10',
    '8',
    '0',
    '90',
    '2',
    '70',
    '0',
    '10',
    '0',
    '20',
    '0',
    '42',
    '1',
    '10',
    '10',
    '20',
    '0',
    '0',
    'ENDSEC',
    '0',
    'EOF'
  ].join('\n');
}

function createWraparoundArcDxf(): string {
  return [
    '0',
    'SECTION',
    '2',
    'ENTITIES',
    '0',
    'ARC',
    '5',
    '11',
    '8',
    '0',
    '10',
    '5',
    '20',
    '5',
    '40',
    '5',
    '50',
    '90',
    '51',
    '0',
    '0',
    'ENDSEC',
    '0',
    'EOF'
  ].join('\n');
}

function createUnsupportedSplineDxf(): string {
  return [
    '0',
    'SECTION',
    '2',
    'ENTITIES',
    '0',
    'SPLINE',
    '5',
    '20',
    '8',
    '0',
    '70',
    '0',
    '71',
    '3',
    '72',
    '0',
    '73',
    '3',
    '74',
    '0',
    '10',
    '0',
    '20',
    '0',
    '10',
    '5',
    '20',
    '5',
    '10',
    '10',
    '20',
    '0',
    '0',
    'ENDSEC',
    '0',
    'EOF'
  ].join('\n');
}