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