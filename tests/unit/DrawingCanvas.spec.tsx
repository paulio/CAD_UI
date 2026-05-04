import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DrawingCanvas } from '../../src/renderer/src/components/DrawingCanvas';
import type { ViewerScene } from '../../src/shared/viewerTypes';

const noopHandlers = {
  showSurveyPoints: false,
  onToggleSurveyPoints: () => undefined
};

describe('DrawingCanvas', () => {
  it('renders wraparound arcs with the correct SVG large-arc flags from normalized arc data', () => {
    const scene: ViewerScene = {
      drawingPath: 'wraparound-arc.dxf',
      bounds: {
        minX: 0,
        minY: 0,
        maxX: 20,
        maxY: 20
      },
      entities: [
        {
          id: 'entity-arc-1',
          kind: 'arc',
          handle: 'A1',
          layer: '0',
          label: 'Wrap arc',
          bounds: {
            minX: 5,
            minY: 5,
            maxX: 15,
            maxY: 15
          },
          cx: 10,
          cy: 10,
          r: 5,
          startAngle: Math.PI / 2,
          endAngle: 0
        }
      ],
      handleIndex: {
        A1: 'entity-arc-1'
      }
    };

    render(
      <DrawingCanvas scene={scene} highlightedEntityIds={[]} highlightMode="none" selectedEntityId={null} onSelectEntity={vi.fn()} {...noopHandlers} />
    );

    expect(screen.getByRole('button', { name: 'Wrap arc' })).toHaveAttribute('d', 'M 10 5 A 5 5 0 1 0 15 10');
  });

  it('visually closes closed polylines by repeating the first point in the rendered SVG polyline', () => {
    const scene: ViewerScene = {
      drawingPath: 'closed-polyline.dxf',
      bounds: {
        minX: 0,
        minY: 0,
        maxX: 10,
        maxY: 10
      },
      entities: [
        {
          id: 'entity-polyline-1',
          kind: 'polyline',
          handle: 'P1',
          layer: '0',
          label: 'Closed boundary',
          bounds: {
            minX: 0,
            minY: 0,
            maxX: 10,
            maxY: 10
          },
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 }
          ],
          vertices: [
            { x: 0, y: 0, bulge: 0 },
            { x: 10, y: 0, bulge: 0 },
            { x: 10, y: 10, bulge: 0 }
          ],
          closed: true
        }
      ],
      handleIndex: {
        P1: 'entity-polyline-1'
      }
    };

    render(
      <DrawingCanvas scene={scene} highlightedEntityIds={[]} highlightMode="none" selectedEntityId={null} onSelectEntity={vi.fn()} {...noopHandlers} />
    );

    expect(screen.getByRole('button', { name: 'Closed boundary' })).toHaveAttribute('points', '0,10 10,10 10,0 0,10');
  });

  it('renders bulged polyline segments as curved SVG path commands instead of a straight polyline chord', () => {
    const scene: ViewerScene = {
      drawingPath: 'bulged-polyline.dxf',
      bounds: {
        minX: 0,
        minY: -5,
        maxX: 10,
        maxY: 0
      },
      entities: [
        {
          id: 'entity-polyline-2',
          kind: 'polyline',
          handle: 'P2',
          layer: '0',
          label: 'Curved boundary',
          bounds: {
            minX: 0,
            minY: -5,
            maxX: 10,
            maxY: 0
          },
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 }
          ],
          vertices: [
            { x: 0, y: 0, bulge: 1 },
            { x: 10, y: 0, bulge: 0 }
          ],
          closed: false
        }
      ],
      handleIndex: {
        P2: 'entity-polyline-2'
      }
    };

    const { container } = render(
      <DrawingCanvas scene={scene} highlightedEntityIds={[]} highlightMode="none" selectedEntityId={null} onSelectEntity={vi.fn()} {...noopHandlers} />
    );

    const curvedPath = screen.getByRole('button', { name: 'Curved boundary' });

    expect(curvedPath.tagName.toLowerCase()).toBe('path');
    expect(curvedPath).toHaveAttribute('d', 'M 0 0 A 5 5 0 0 0 10 0');
    expect(container.querySelector('polyline[aria-label="Curved boundary"]')).toBeNull();
  });

  it('exposes Fit all and Fit selection toolbar controls and disables fit-selection without a target', () => {
    const scene: ViewerScene = {
      drawingPath: 'tools.dxf',
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
      focusBounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
      entities: [
        {
          id: 'entity-line-1',
          kind: 'line',
          handle: 'L1',
          layer: '0',
          label: 'Line A',
          bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
          x1: 0,
          y1: 0,
          x2: 100,
          y2: 100
        }
      ],
      handleIndex: { L1: 'entity-line-1' }
    };

    render(
      <DrawingCanvas
        scene={scene}
        highlightedEntityIds={[]}
        highlightMode="none"
        selectedEntityId={null}
        onSelectEntity={vi.fn()}
        {...noopHandlers}
      />
    );

    expect(screen.getByRole('button', { name: 'Fit all' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Fit selection' })).toBeDisabled();
  });

  it('updates the SVG viewBox when the user clicks Fit selection on a selected entity', () => {
    const scene: ViewerScene = {
      drawingPath: 'fit-selection.dxf',
      bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 1000 },
      focusBounds: { minX: 0, minY: 0, maxX: 1000, maxY: 1000 },
      entities: [
        {
          id: 'entity-near',
          kind: 'line',
          handle: 'L1',
          layer: '0',
          label: 'Near edge',
          bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
          x1: 0,
          y1: 0,
          x2: 10,
          y2: 10
        },
        {
          id: 'entity-far',
          kind: 'line',
          handle: 'L2',
          layer: '0',
          label: 'Far edge',
          bounds: { minX: 980, minY: 980, maxX: 1000, maxY: 1000 },
          x1: 980,
          y1: 980,
          x2: 1000,
          y2: 1000
        }
      ],
      handleIndex: { L1: 'entity-near', L2: 'entity-far' }
    };

    render(
      <DrawingCanvas
        scene={scene}
        highlightedEntityIds={[]}
        highlightMode="none"
        selectedEntityId="entity-far"
        onSelectEntity={vi.fn()}
        {...noopHandlers}
      />
    );

    const surface = screen.getByRole('img', { name: 'Drawing canvas surface' });
    const viewBoxBefore = surface.getAttribute('viewBox');

    fireEvent.click(screen.getByRole('button', { name: 'Fit selection' }));

    const viewBoxAfter = surface.getAttribute('viewBox');
    expect(viewBoxAfter).not.toBeNull();
    expect(viewBoxAfter).not.toBe(viewBoxBefore);
  });
});
