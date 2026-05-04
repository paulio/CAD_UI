import { describe, expect, it } from 'vitest';
import {
  normalizeBox,
  selectInBox,
  selectModeForDrag,
  type SelectableEntity
} from '../../src/renderer/src/viewer/selectionHitTest';

const entities: SelectableEntity[] = [
  { id: 'inside', layer: 'A', bounds: { minX: 5, minY: 5, maxX: 9, maxY: 9 } },
  { id: 'crossing', layer: 'A', bounds: { minX: 8, minY: 0, maxX: 12, maxY: 4 } },
  { id: 'outside', layer: 'A', bounds: { minX: 20, minY: 20, maxX: 30, maxY: 30 } },
  { id: 'on-hidden', layer: 'B', bounds: { minX: 1, minY: 1, maxX: 4, maxY: 4 } },
  { id: 'on-locked', layer: 'C', bounds: { minX: 2, minY: 2, maxX: 6, maxY: 6 } },
  { id: 'no-bounds', layer: 'A', bounds: null }
];

const layerVisibility = {
  A: { visible: true, locked: false },
  B: { visible: false, locked: false },
  C: { visible: true, locked: true }
};

describe('selectInBox', () => {
  const box = { minX: 0, minY: 0, maxX: 10, maxY: 10 };

  it('window mode selects only fully enclosed entities on visible unlocked layers', () => {
    expect(selectInBox(entities, box, { mode: 'window', layerVisibility })).toEqual(['inside']);
  });

  it('crossing mode also selects entities that intersect the box', () => {
    expect(selectInBox(entities, box, { mode: 'crossing', layerVisibility })).toEqual(['inside', 'crossing']);
  });

  it('skips entities without bounds and entities on hidden or locked layers', () => {
    const result = selectInBox(entities, box, { mode: 'crossing', layerVisibility });

    expect(result).not.toContain('on-hidden');
    expect(result).not.toContain('on-locked');
    expect(result).not.toContain('no-bounds');
  });
});

describe('normalizeBox', () => {
  it('produces an axis-aligned box regardless of drag direction', () => {
    expect(normalizeBox({ x: 10, y: 5 }, { x: 2, y: 12 })).toEqual({ minX: 2, minY: 5, maxX: 10, maxY: 12 });
  });
});

describe('selectModeForDrag', () => {
  it('returns window for left-to-right drags', () => {
    expect(selectModeForDrag({ x: 0, y: 0 }, { x: 10, y: 5 })).toBe('window');
  });

  it('returns crossing for right-to-left drags', () => {
    expect(selectModeForDrag({ x: 10, y: 0 }, { x: 1, y: 5 })).toBe('crossing');
  });
});
