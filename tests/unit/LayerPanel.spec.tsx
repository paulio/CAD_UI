import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LayerPanel } from '../../src/renderer/src/components/LayerPanel';
import type { ViewerLayer } from '../../src/shared/viewerTypes';

const layers: ViewerLayer[] = [
  { id: 'SITE', name: 'SITE', color: '#aabbcc', visible: true, locked: false, entityCount: 12 },
  { id: 'GRID', name: 'GRID', color: null, visible: true, locked: false, entityCount: 5 }
];

const layerState = {
  SITE: { visible: true, locked: false },
  GRID: { visible: true, locked: false }
};

describe('LayerPanel', () => {
  it('renders one row per layer with name, count, and color swatch', () => {
    render(<LayerPanel layers={layers} layerState={layerState} onChange={vi.fn()} />);

    expect(screen.getByText('SITE')).toBeInTheDocument();
    expect(screen.getByText('GRID')).toBeInTheDocument();
    expect(screen.getByLabelText('12 entities')).toBeInTheDocument();
    expect(screen.getByLabelText('5 entities')).toBeInTheDocument();
  });

  it('emits a visibility change when the user toggles a layer checkbox', () => {
    const onChange = vi.fn();
    render(<LayerPanel layers={layers} layerState={layerState} onChange={onChange} />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'SITE visible' }));

    expect(onChange).toHaveBeenCalledWith({ id: 'SITE', patch: { visible: false } });
  });

  it('emits an isolate change when the user clicks the isolate button', () => {
    const onChange = vi.fn();
    render(<LayerPanel layers={layers} layerState={layerState} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Isolate GRID' }));

    expect(onChange).toHaveBeenCalledWith({ id: 'GRID', patch: { isolate: true } });
  });

  it('emits a lock toggle and reflects the pressed state from layer state', () => {
    const onChange = vi.fn();
    const lockedState = {
      SITE: { visible: true, locked: true },
      GRID: { visible: true, locked: false }
    };
    render(<LayerPanel layers={layers} layerState={lockedState} onChange={onChange} />);

    const lockButton = screen.getByRole('button', { name: 'Unlock SITE' });
    expect(lockButton).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(lockButton);
    expect(onChange).toHaveBeenCalledWith({ id: 'SITE', patch: { locked: false } });
  });

  it('emits a show-all change when the user clicks Show all', () => {
    const onChange = vi.fn();
    render(<LayerPanel layers={layers} layerState={layerState} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));

    expect(onChange).toHaveBeenCalledWith({ patch: { showAll: true } });
  });
});
