import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/src/App';

describe('App shell', () => {
  afterEach(() => {
    delete window.cadUiApi;
  });

  it('renders the CAD UI chrome', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'CAD UI' })).toBeInTheDocument();
    expect(screen.getByText('No drawing loaded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open DWG' })).toBeDisabled();
  });

  it('falls back to an explicit safe state when bootstrap loading fails', async () => {
    window.cadUiApi = {
      loadSettings: vi.fn(),
      saveSettings: vi.fn(),
      loadBootstrap: vi.fn().mockRejectedValue(new Error('corrupt settings')),
      openDrawing: vi.fn(),
      sendPrompt: vi.fn()
    };

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('AI status: bootstrap error')).toBeInTheDocument();
    });

    expect(screen.getByText('Selected model: Unavailable')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Failed to load application settings. Running in a safe fallback state.'
    );
  });

  it('renders recovered default settings when bootstrap succeeds after settings recovery', async () => {
    window.cadUiApi = {
      loadSettings: vi.fn(),
      saveSettings: vi.fn(),
      loadBootstrap: vi.fn().mockResolvedValue({
        authState: 'checking',
        models: [],
        settings: {
          selectedModel: null,
          recentDrawings: [],
          lastDrawingPath: null,
          windowBounds: null
        }
      }),
      openDrawing: vi.fn(),
      sendPrompt: vi.fn()
    };

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('AI status: checking')).toBeInTheDocument();
    });

    expect(screen.getByText('Selected model: Not selected')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});