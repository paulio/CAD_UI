import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/src/App';

describe('App shell', () => {
  afterEach(() => {
    delete window.cadUiApi;
  });

  it('renders the CAD UI chrome and drives the drawing highlight workflow', async () => {
    const sessionDiagnostics = [
      {
        timestamp: '2026-05-03T12:00:00.000Z',
        source: 'cad-ai',
        level: 'info' as const,
        message: 'Opened drawing session for D:/drawings/site.dxf',
        detail: 'D:/drawings/.cadqcache'
      }
    ];
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
      diagnostics: sessionDiagnostics
    });
    const sendPrompt = vi
      .fn()
      .mockResolvedValueOnce({
        text: 'The highlighted tree is adjacent to the frontage line.',
        featureIds: ['tree-feature'],
        entityHandles: ['b0'],
        highlightMode: 'outline',
        evidence: [
          {
            featureId: 'tree-feature',
            handle: 'b0',
            source: 'cad-ai'
          }
        ]
      })
      .mockResolvedValueOnce({
        text: 'Both highlighted entities remain in focus.',
        featureIds: ['tree-feature', 'frontage-feature'],
        entityHandles: ['B0', 'A1'],
        highlightMode: 'focus',
        evidence: [
          {
            featureId: 'tree-feature',
            handle: 'B0',
            source: 'cad-ai'
          },
          {
            featureId: 'frontage-feature',
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
      listDiagnostics: vi.fn().mockResolvedValue(sessionDiagnostics),
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
    expect(screen.getByRole('button', { name: 'Focus feature tree-feature' })).toBeInTheDocument();
    expect(screen.getByText('Diagnostics')).toBeInTheDocument();
    expect(screen.getByText('Opened drawing session for D:/drawings/site.dxf')).toBeInTheDocument();
    expect(screen.getByText('Selected entity')).toBeInTheDocument();
    expect(screen.getByText('entity-tree-1')).toBeInTheDocument();
    expect(screen.getByLabelText('Drawing canvas')).toHaveTextContent('Highlighted: entity-tree-1');
    expect(screen.getByLabelText('Drawing canvas')).toHaveTextContent('Highlight mode: outline');

    fireEvent.change(promptInput, { target: { value: 'Keep the same geometry in focus.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send prompt' }));

    await waitFor(() => {
      expect(sendPrompt).toHaveBeenNthCalledWith(2, {
        model: 'gpt-5.4',
        prompt: 'Keep the same geometry in focus.',
        drawingPath: 'D:/drawings/site.dxf',
        selectedEntityIds: ['entity-tree-1'],
        selectedEntityHandles: ['B0']
      });
    });

    expect(screen.getByText('Both highlighted entities remain in focus.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Focus feature frontage-feature' }));

    expect(screen.getByLabelText('Drawing canvas')).toHaveTextContent('Highlighted: entity-line-1');
    expect(screen.getByText('entity-line-1')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Copilot model' }), { target: { value: 'gpt-5.4-mini' } });

    await waitFor(() => {
      expect(saveSettings).toHaveBeenCalledWith({
        selectedModel: 'gpt-5.4-mini',
        recentDrawings: ['D:/drawings/site.dxf'],
        lastDrawingPath: 'D:/drawings/site.dxf',
        windowBounds: null
      });
    });
  });

  it('surfaces a missing-DXF open failure instead of leaving the viewer empty without context', async () => {
    const message =
      'Opened DWG D:/drawings/site.dwg but CAD_AI did not provide a usable DXF path. Generate a DXF output path or place an adjacent .dxf file next to the DWG.';
    const openDrawing = vi.fn().mockResolvedValue({
      canceled: false,
      filePath: 'D:/drawings/site.dwg',
      session: null,
      scene: null,
      error: message,
      diagnostics: [
        {
          timestamp: '2026-05-03T12:00:00.000Z',
          source: 'cad-ai',
          level: 'error' as const,
          message: 'Failed to open drawing session for D:/drawings/site.dwg',
          detail: message
        }
      ]
    });

    window.cadUiApi = {
      loadSettings: vi.fn(),
      saveSettings: vi.fn().mockResolvedValue(undefined),
      loadBootstrap: vi.fn().mockResolvedValue({
        authState: 'ready',
        models: ['gpt-5.4'],
        settings: {
          selectedModel: 'gpt-5.4',
          recentDrawings: [],
          lastDrawingPath: null,
          windowBounds: null
        }
      }),
      listDiagnostics: vi.fn().mockResolvedValue([]),
      openDrawing,
      sendPrompt: vi.fn()
    };

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('AI status: ready')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open DWG' }));

    await waitFor(() => {
      expect(screen.getAllByText(message)).toHaveLength(2);
    });

    expect(screen.getByLabelText('Drawing canvas')).toHaveTextContent('No drawing loaded');
    expect(screen.getByText('Failed to open drawing session for D:/drawings/site.dwg')).toBeInTheDocument();
  });

  it('allows replaying handle-only assistant geometry links', async () => {
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
          }
        ],
        handleIndex: {
          A1: 'entity-line-1'
        }
      },
      error: null,
      diagnostics: []
    });

    window.cadUiApi = {
      loadSettings: vi.fn(),
      saveSettings: vi.fn().mockResolvedValue(undefined),
      loadBootstrap: vi.fn().mockResolvedValue({
        authState: 'ready',
        models: ['gpt-5.4'],
        settings: {
          selectedModel: 'gpt-5.4',
          recentDrawings: [],
          lastDrawingPath: null,
          windowBounds: null
        }
      }),
      listDiagnostics: vi.fn().mockResolvedValue([]),
      openDrawing,
      sendPrompt: vi.fn().mockResolvedValue({
        text: 'Highlighted the frontage line.',
        featureIds: [],
        entityHandles: ['a1'],
        highlightMode: 'focus',
        evidence: []
      })
    };

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('AI status: ready')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open DWG' }));

    await waitFor(() => {
      expect(screen.getByText('site.dxf')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole('textbox', { name: 'Ask about the drawing' }), {
      target: { value: 'Highlight the frontage line.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send prompt' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Focus linked geometry' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Focus linked geometry' }));

    expect(screen.getByLabelText('Drawing canvas')).toHaveTextContent('Highlighted: entity-line-1');
  });

  it('derives feature replay geometry from evidence when top-level handles are absent', async () => {
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
          }
        ],
        handleIndex: {
          A1: 'entity-line-1'
        }
      },
      error: null,
      diagnostics: []
    });

    window.cadUiApi = {
      loadSettings: vi.fn(),
      saveSettings: vi.fn().mockResolvedValue(undefined),
      loadBootstrap: vi.fn().mockResolvedValue({
        authState: 'ready',
        models: ['gpt-5.4'],
        settings: {
          selectedModel: 'gpt-5.4',
          recentDrawings: [],
          lastDrawingPath: null,
          windowBounds: null
        }
      }),
      listDiagnostics: vi.fn().mockResolvedValue([]),
      openDrawing,
      sendPrompt: vi.fn().mockResolvedValue({
        text: 'The frontage feature is highlighted.',
        featureIds: ['frontage-feature'],
        entityHandles: [],
        highlightMode: 'focus',
        evidence: [
          {
            featureId: 'frontage-feature',
            handle: 'a1',
            source: 'cad-ai'
          }
        ]
      })
    };

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('AI status: ready')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open DWG' }));

    await waitFor(() => {
      expect(screen.getByText('site.dxf')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole('textbox', { name: 'Ask about the drawing' }), {
      target: { value: 'Highlight the frontage feature.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send prompt' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Focus feature frontage-feature' })).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Drawing canvas')).toHaveTextContent('Highlighted: entity-line-1');

    fireEvent.click(screen.getByRole('button', { name: 'Focus feature frontage-feature' }));

    expect(screen.getByLabelText('Drawing canvas')).toHaveTextContent('Highlighted: entity-line-1');
    expect(screen.getByLabelText('Drawing canvas')).toHaveTextContent('Highlight mode: focus');
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

  it('refreshes diagnostics after a prompt failure returned from the main process', async () => {
    const listDiagnostics = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          timestamp: '2026-05-03T12:05:00.000Z',
          source: 'copilot',
          level: 'error',
          message: 'Prompt execution failed.',
          detail: 'Command timed out'
        }
      ]);

    window.cadUiApi = {
      loadSettings: vi.fn(),
      saveSettings: vi.fn().mockResolvedValue(undefined),
      loadBootstrap: vi.fn().mockResolvedValue({
        authState: 'ready',
        models: ['gpt-5.4'],
        settings: {
          selectedModel: 'gpt-5.4',
          recentDrawings: [],
          lastDrawingPath: null,
          windowBounds: null
        }
      }),
      listDiagnostics,
      openDrawing: vi.fn().mockResolvedValue({
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
          entities: [],
          handleIndex: {}
        },
        error: null,
        diagnostics: []
      }),
      sendPrompt: vi.fn().mockResolvedValue({
        text: 'Copilot CLI prompt failed.',
        featureIds: [],
        entityHandles: [],
        highlightMode: 'none',
        evidence: []
      })
    };

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('AI status: ready')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open DWG' }));

    await waitFor(() => {
      expect(screen.getByText('site.dxf')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole('textbox', { name: 'Ask about the drawing' }), {
      target: { value: 'Summarize the drawing.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send prompt' }));

    await waitFor(() => {
      expect(screen.getByText('Copilot CLI prompt failed.')).toBeInTheDocument();
    });

    expect(listDiagnostics).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Prompt execution failed.')).toBeInTheDocument();
    expect(screen.getByText('Command timed out')).toBeInTheDocument();
  });

  it('refreshes diagnostics when prompt delivery rejects before the renderer receives a response', async () => {
    const listDiagnostics = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          timestamp: '2026-05-03T12:06:00.000Z',
          source: 'copilot',
          level: 'error',
          message: 'Prompt execution failed.',
          detail: 'Transport dropped'
        }
      ]);

    window.cadUiApi = {
      loadSettings: vi.fn(),
      saveSettings: vi.fn().mockResolvedValue(undefined),
      loadBootstrap: vi.fn().mockResolvedValue({
        authState: 'ready',
        models: ['gpt-5.4'],
        settings: {
          selectedModel: 'gpt-5.4',
          recentDrawings: [],
          lastDrawingPath: null,
          windowBounds: null
        }
      }),
      listDiagnostics,
      openDrawing: vi.fn().mockResolvedValue({
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
          entities: [],
          handleIndex: {}
        },
        error: null,
        diagnostics: []
      }),
      sendPrompt: vi.fn().mockRejectedValue(new Error('Transport dropped'))
    };

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('AI status: ready')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open DWG' }));

    await waitFor(() => {
      expect(screen.getByText('site.dxf')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole('textbox', { name: 'Ask about the drawing' }), {
      target: { value: 'Summarize the drawing.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send prompt' }));

    await waitFor(() => {
      expect(screen.getByText('Prompt delivery failed before the renderer received a response.')).toBeInTheDocument();
    });

    expect(listDiagnostics).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Prompt execution failed.')).toBeInTheDocument();
    expect(screen.getByText('Transport dropped')).toBeInTheDocument();
  });
});