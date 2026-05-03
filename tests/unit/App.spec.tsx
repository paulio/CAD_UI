import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/src/App';

describe('App shell', () => {
  afterEach(() => {
    delete window.cadUiApi;
  });

  it('renders the CAD UI chrome and drives the drawing highlight workflow', async () => {
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    const openDrawing = vi.fn().mockResolvedValue({
      canceled: false,
      filePath: 'D:/drawings/site.dxf',
      session: {
        sourcePath: 'D:/drawings/site.dxf',
        dxfPath: 'D:/drawings/site.dxf',
        cachePath: 'D:/drawings/.cadqcache',
        openedAt: '2026-05-03T12:00:00.000Z'
      },
      scene: {
        drawingPath: 'D:/drawings/site.dxf',
        bounds: {
          minX: 0,
          minY: 0,
          maxX: 100,
          maxY: 50
        },
        entities: [
          {
            id: 'entity-line-1',
            kind: 'line',
            handle: 'A1',
            layer: 'SITE',
            label: null,
            bounds: {
              minX: 0,
              minY: 0,
              maxX: 100,
              maxY: 0
            },
            x1: 0,
            y1: 0,
            x2: 100,
            y2: 0
          },
          {
            id: 'entity-tree-1',
            kind: 'insert',
            handle: 'B0',
            layer: 'L-PLNT-TREE',
            label: 'TREE-OAK',
            bounds: {
              minX: 15,
              minY: 5,
              maxX: 15,
              maxY: 5
            },
            x: 15,
            y: 5,
            name: 'TREE-OAK'
          }
        ],
        handleIndex: {
          A1: 'entity-line-1',
          B0: 'entity-tree-1'
        }
      },
      error: null,
      diagnostics: [
        {
          timestamp: '2026-05-03T12:00:00.000Z',
          source: 'cad-ai',
          level: 'info',
          message: 'Opened drawing session for D:/drawings/site.dxf',
          detail: 'D:/drawings/.cadqcache'
        }
      ]
    });
    const sendPrompt = vi
      .fn()
      .mockResolvedValueOnce({
        text: 'The highlighted tree is adjacent to the frontage line.',
        featureIds: ['entity-tree-1'],
        entityHandles: ['A1'],
        highlightMode: 'focus',
        evidence: [
          {
            featureId: 'entity-tree-1',
            handle: 'A1',
            source: 'cad-ai'
          }
        ]
      })
      .mockResolvedValueOnce({
        text: 'Both highlighted entities remain in focus.',
        featureIds: ['entity-tree-1', 'entity-line-1'],
        entityHandles: ['B0', 'A1'],
        highlightMode: 'focus',
        evidence: [
          {
            featureId: 'entity-tree-1',
            handle: 'B0',
            source: 'cad-ai'
          },
          {
            featureId: 'entity-line-1',
            handle: 'A1',
            source: 'cad-ai'
          }
        ]
      });

    window.cadUiApi = {
      loadSettings: vi.fn(),
      saveSettings,
      loadBootstrap: vi.fn().mockResolvedValue({
        authState: 'ready',
        models: ['gpt-5.4', 'gpt-5.4-mini'],
        settings: {
          selectedModel: 'gpt-5.4',
          recentDrawings: [],
          lastDrawingPath: null,
          windowBounds: null
        }
      }),
      listDiagnostics: vi.fn().mockResolvedValue([]),
      openDrawing,
      sendPrompt
    };

    render(<App />);

    expect(screen.getByRole('heading', { name: 'CAD UI' })).toBeInTheDocument();
    expect(screen.getByLabelText('Drawing canvas')).toHaveTextContent('No drawing loaded');
    expect(screen.getByRole('button', { name: 'Open DWG' })).toBeDisabled();

    await waitFor(() => {
      expect(screen.getByText('AI status: ready')).toBeInTheDocument();
    });

    const openButton = screen.getByRole('button', { name: 'Open DWG' });
    expect(openButton).toBeEnabled();

    fireEvent.click(openButton);

    await waitFor(() => {
      expect(screen.getByText('site.dxf')).toBeInTheDocument();
    });

    const promptInput = screen.getByRole('textbox', { name: 'Ask about the drawing' });
    fireEvent.change(promptInput, { target: { value: 'What is next to the frontage line?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send prompt' }));

    await waitFor(() => {
      expect(sendPrompt).toHaveBeenCalledWith({
        model: 'gpt-5.4',
        prompt: 'What is next to the frontage line?',
        drawingPath: 'D:/drawings/site.dxf',
        selectedEntityIds: [],
        selectedEntityHandles: []
      });
    });

    expect(screen.getByText('The highlighted tree is adjacent to the frontage line.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Focus feature entity-tree-1' })).toBeInTheDocument();
    expect(screen.getByText('Diagnostics')).toBeInTheDocument();
    expect(screen.getByText('Opened drawing session for D:/drawings/site.dxf')).toBeInTheDocument();
    expect(screen.getByText('Selected entity')).toBeInTheDocument();
    expect(screen.getByText('entity-tree-1')).toBeInTheDocument();
    expect(screen.getByLabelText('Drawing canvas')).toHaveTextContent('Highlighted: entity-tree-1');

    fireEvent.change(promptInput, { target: { value: 'Keep the same geometry in focus.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send prompt' }));

    await waitFor(() => {
      expect(sendPrompt).toHaveBeenNthCalledWith(2, {
        model: 'gpt-5.4',
        prompt: 'Keep the same geometry in focus.',
        drawingPath: 'D:/drawings/site.dxf',
        selectedEntityIds: ['entity-tree-1', 'entity-line-1'],
        selectedEntityHandles: ['B0', 'A1']
      });
    });

    expect(screen.getByText('Both highlighted entities remain in focus.')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Copilot model' }), { target: { value: 'gpt-5.4-mini' } });

    await waitFor(() => {
      expect(saveSettings).toHaveBeenCalledWith({
        selectedModel: 'gpt-5.4-mini',
        recentDrawings: [],
        lastDrawingPath: null,
        windowBounds: null
      });
    });
  });

  it('falls back to an explicit safe state when bootstrap loading fails', async () => {
    window.cadUiApi = {
      loadSettings: vi.fn(),
      saveSettings: vi.fn(),
      loadBootstrap: vi.fn().mockRejectedValue(new Error('corrupt settings')),
      listDiagnostics: vi.fn().mockResolvedValue([]),
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
});