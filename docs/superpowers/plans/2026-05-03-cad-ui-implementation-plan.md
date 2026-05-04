# CAD UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows-first Electron desktop app that uses GitHub Copilot CLI for AI access, launches the sibling CAD_AI toolchain for drawing analysis, persists the selected model across restarts, renders a 2D drawing view, and highlights referenced geometry from chat results.

**Architecture:** The app is an Electron shell with strict separation between the main process and renderer. The main process owns filesystem access, Copilot CLI orchestration, CAD_AI subprocess execution, settings persistence, and DXF scene normalization. The renderer is a React UI that consumes typed IPC contracts, renders the chat and viewer, and applies highlight overlays from structured assistant responses.

**Tech Stack:** Electron, electron-vite, React, TypeScript, Vitest, Playwright, dxf-parser, SVG viewer primitives, child_process-based CLI adapters.

---

## File Structure

### Root configuration

- Create: `package.json`
- Create: `.gitignore`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `electron.vite.config.ts`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `tests/setup.ts`

Responsibilities:

- root scripts for dev, build, unit tests, integration tests, and Electron E2E tests
- TypeScript compilation boundaries for Electron main/preload and renderer
- test runner configuration and Electron launch wiring

### Main process

- Create: `src/main/main.ts`
- Create: `src/main/window/createMainWindow.ts`
- Create: `src/main/ipc/registerIpc.ts`
- Create: `src/main/services/settingsStore.ts`
- Create: `src/main/services/diagnosticsStore.ts`
- Create: `src/main/adapters/copilot/copilotAdapter.ts`
- Create: `src/main/adapters/copilot/modelCatalog.ts`
- Create: `src/main/adapters/cadAi/cadAiLocator.ts`
- Create: `src/main/adapters/cadAi/cadAiAdapter.ts`
- Create: `src/main/adapters/cadAi/drawingSessionService.ts`
- Create: `src/main/adapters/viewer/dxfSceneBuilder.ts`

Responsibilities:

- Electron lifecycle and BrowserWindow creation
- typed IPC handlers for auth, models, drawings, chat, diagnostics
- persisted app settings
- Copilot CLI probing and prompt execution
- CAD_AI executable resolution and ingest/query orchestration
- DXF parsing and normalized scene generation

### Shared contracts

- Create: `src/shared/contracts.ts`
- Create: `src/shared/viewerTypes.ts`

Responsibilities:

- request/response types for IPC
- normalized assistant payload schema
- viewer scene and highlight contract types

### Preload bridge

- Create: `src/preload/index.ts`

Responsibilities:

- expose a minimal `window.cadUiApi` surface
- hide Electron and Node internals from the renderer

### Renderer

- Create: `src/renderer/index.html`
- Create: `src/renderer/src/main.tsx`
- Create: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/global.d.ts`
- Create: `src/renderer/src/store/useAppStore.ts`
- Create: `src/renderer/src/components/TopBar.tsx`
- Create: `src/renderer/src/components/ChatPanel.tsx`
- Create: `src/renderer/src/components/DrawingCanvas.tsx`
- Create: `src/renderer/src/components/FeatureInspector.tsx`
- Create: `src/renderer/src/components/DiagnosticsPanel.tsx`
- Create: `src/renderer/src/styles.css`

Responsibilities:

- top bar with file, auth, and model controls
- chat transcript and prompt input
- SVG-based 2D viewer with click and highlight support
- selected feature and diagnostics surfaces
- app state hydration and IPC wiring

### Tests and fixtures

- Create: `tests/unit/settingsStore.spec.ts`
- Create: `tests/unit/copilotAdapter.spec.ts`
- Create: `tests/unit/dxfSceneBuilder.spec.ts`
- Create: `tests/unit/App.spec.tsx`
- Create: `tests/integration/drawingSession.integration.spec.ts`
- Create: `tests/fixtures/site.dxf`
- Create: `e2e/cad-ui.e2e.ts`

Responsibilities:

- validate persistence, CLI parsing, DXF normalization, renderer state changes, sibling CAD_AI integration, and Electron user flows

## Task 1: Scaffold The Electron Workspace

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `electron.vite.config.ts`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `tests/setup.ts`
- Create: `src/main/main.ts`
- Create: `src/main/window/createMainWindow.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/index.html`
- Create: `src/renderer/src/main.tsx`
- Create: `src/renderer/src/App.tsx`
- Test: `tests/unit/App.spec.tsx`

- [ ] **Step 1: Write the failing app shell test**

```tsx
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../../src/renderer/src/App';

describe('App shell', () => {
  it('renders the CAD UI chrome', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'CAD UI' })).toBeInTheDocument();
    expect(screen.getByText('No drawing loaded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open DWG' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- tests/unit/App.spec.tsx`
Expected: FAIL with missing package metadata or missing `App` module.

- [ ] **Step 3: Write the minimal Electron and renderer scaffold**

```json
{
  "name": "cad-ui",
  "version": "0.1.0",
  "private": true,
  "main": "dist-electron/main.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "test:unit": "vitest run",
    "test:integration": "vitest run tests/integration",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "dxf-parser": "^1.1.2",
    "electron": "^37.0.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.54.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@vitejs/plugin-react": "^4.4.1",
    "@types/node": "^22.15.0",
    "@types/react": "^19.1.2",
    "@types/react-dom": "^19.1.2",
    "electron-vite": "^3.1.0",
    "jsdom": "^26.1.0",
    "typescript": "^5.8.3",
    "vite": "^6.3.5",
    "vitest": "^3.1.4"
  }
}
```

```tsx
export function App() {
  return (
    <main>
      <header>
        <h1>CAD UI</h1>
        <button disabled>Open DWG</button>
      </header>
      <section>No drawing loaded</section>
    </main>
  );
}
```

```ts
import { BrowserWindow, app } from 'electron';

async function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    webPreferences: {
      preload: undefined,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await window.loadURL(process.env.VITE_DEV_SERVER_URL);
    return;
  }

  await window.loadFile('dist/index.html');
}

app.whenReady().then(createWindow);
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `npm run test:unit -- tests/unit/App.spec.tsx`
Expected: PASS with `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore tsconfig.json tsconfig.node.json electron.vite.config.ts vitest.config.ts playwright.config.ts src/main src/preload src/renderer tests/unit/App.spec.tsx
git commit -m "chore: scaffold Electron CAD UI workspace"
```

## Task 2: Add Shared Contracts, Settings Persistence, And IPC Shell

**Files:**
- Create: `src/shared/contracts.ts`
- Create: `src/shared/viewerTypes.ts`
- Create: `src/main/services/settingsStore.ts`
- Create: `src/main/ipc/registerIpc.ts`
- Modify: `src/main/main.ts`
- Modify: `src/preload/index.ts`
- Create: `src/renderer/src/global.d.ts`
- Modify: `src/renderer/src/App.tsx`
- Test: `tests/unit/settingsStore.spec.ts`

- [ ] **Step 1: Write the failing persistence test**

```ts
import { describe, expect, it } from 'vitest';
import { SettingsStore } from '../../src/main/services/settingsStore';

describe('SettingsStore', () => {
  it('persists and reloads the selected model', async () => {
    const store = new SettingsStore('tests/.tmp/settings.json');

    await store.save({ selectedModel: 'gpt-5.4', recentDrawings: [], lastDrawingPath: null, windowBounds: null });

    const reloaded = new SettingsStore('tests/.tmp/settings.json');
    const settings = await reloaded.load();

    expect(settings.selectedModel).toBe('gpt-5.4');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- tests/unit/settingsStore.spec.ts`
Expected: FAIL with `SettingsStore` missing.

- [ ] **Step 3: Implement typed settings, contracts, and preload bridge**

```ts
export type AppSettings = {
  selectedModel: string | null;
  recentDrawings: string[];
  lastDrawingPath: string | null;
  windowBounds: { width: number; height: number } | null;
};

export type AuthState = 'checking' | 'ready' | 'reauth-required' | 'cli-missing';

export type AssistantEnvelope = {
  text: string;
  featureIds: string[];
  entityHandles: string[];
  highlightMode: 'focus' | 'pulse' | 'outline' | 'zoomTo' | 'none';
  evidence: Array<{ featureId: string; handle: string; source: string }>;
};
```

```ts
import type { AppSettings, AssistantEnvelope, AuthState } from '../../shared/contracts';

declare global {
  interface Window {
    cadUiApi: {
      loadSettings: () => Promise<AppSettings>;
      saveSettings: (settings: AppSettings) => Promise<void>;
      loadBootstrap: () => Promise<{ authState: AuthState; models: string[]; settings: AppSettings }>;
      openDrawing: () => Promise<unknown>;
      sendPrompt: (request: { model: string | null; prompt: string; drawingPath: string | null; selectedEntityIds: string[] }) => Promise<AssistantEnvelope>;
    };
  }
}

export {};
```

```ts
import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';

const defaultSettings = (): AppSettings => ({
  selectedModel: null,
  recentDrawings: [],
  lastDrawingPath: null,
  windowBounds: null
});

export class SettingsStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<AppSettings> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      return { ...defaultSettings(), ...JSON.parse(raw) };
    } catch {
      return defaultSettings();
    }
  }

  async save(settings: AppSettings): Promise<void> {
    await fs.mkdir(dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(settings, null, 2), 'utf8');
  }
}
```

```ts
contextBridge.exposeInMainWorld('cadUiApi', {
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke('settings:save', settings)
});
```

- [ ] **Step 4: Run the persistence and shell tests**

Run: `npm run test:unit -- tests/unit/settingsStore.spec.ts tests/unit/App.spec.tsx`
Expected: PASS with both tests green.

- [ ] **Step 5: Commit**

```bash
git add src/shared/contracts.ts src/shared/viewerTypes.ts src/main/services/settingsStore.ts src/main/ipc/registerIpc.ts src/main/main.ts src/preload/index.ts src/renderer/src/App.tsx tests/unit/settingsStore.spec.ts
git commit -m "feat: add persisted settings and IPC contracts"
```

## Task 3: Implement Copilot CLI Auth, Model Discovery, And Prompt Adapter

**Files:**
- Create: `src/main/adapters/copilot/modelCatalog.ts`
- Create: `src/main/adapters/copilot/copilotAdapter.ts`
- Modify: `src/main/ipc/registerIpc.ts`
- Modify: `src/shared/contracts.ts`
- Test: `tests/unit/copilotAdapter.spec.ts`

- [ ] **Step 1: Write failing adapter tests for model parsing and auth probing**

```ts
import { describe, expect, it } from 'vitest';
import { parseModelCatalog, parseProbeResult } from '../../src/main/adapters/copilot/modelCatalog';

const helpText = `  \`model\`: AI model to use for Copilot CLI; can be changed with /model command or --model flag option.\n    - \"gpt-5.4\"\n    - \"gpt-5.4-mini\"\n    - \"claude-sonnet-4.6\"`;

describe('Copilot model parsing', () => {
  it('extracts models from copilot help config output', () => {
    expect(parseModelCatalog(helpText)).toEqual(['gpt-5.4', 'gpt-5.4-mini', 'claude-sonnet-4.6']);
  });

  it('normalizes auth failures from probe stderr', () => {
    expect(parseProbeResult({ exitCode: 1, stderr: 'Please run copilot login first.' })).toEqual('reauth-required');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- tests/unit/copilotAdapter.spec.ts`
Expected: FAIL with missing parser functions.

- [ ] **Step 3: Implement the Copilot adapter around real CLI commands**

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function parseModelCatalog(helpText: string): string[] {
  return helpText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- "'))
    .map((line) => line.replace(/^-\s+"|"$/g, ''));
}

export function parseProbeResult(result: { exitCode: number; stderr: string }): AuthState {
  if (result.exitCode === 0) return 'ready';
  if (/login|authenticate|credential/i.test(result.stderr)) return 'reauth-required';
  return 'cli-missing';
}
```

```ts
const PROBE_MODEL = 'gpt-5.4-mini';
const PROBE_PROMPT = 'Reply with AUTH_OK only.';

export class CopilotAdapter {
  async listModels(): Promise<string[]> {
    const { stdout } = await execFileAsync('copilot', ['help', 'config']);
    return parseModelCatalog(stdout);
  }

  async probeAuth(): Promise<AuthState> {
    try {
      await execFileAsync('copilot', ['--model', PROBE_MODEL, '-p', PROBE_PROMPT, '--allow-all-tools', '--output-format', 'json', '--no-custom-instructions']);
      return 'ready';
    } catch (error) {
      const failure = error as { code?: number; stderr?: string };
      return parseProbeResult({ exitCode: failure.code ?? 1, stderr: failure.stderr ?? '' });
    }
  }

  async runPrompt(model: string, prompt: string): Promise<string> {
    const { stdout } = await execFileAsync('copilot', ['--model', model, '-p', prompt, '--allow-all-tools', '--output-format', 'json', '--no-custom-instructions']);
    return stdout;
  }

  async startLogin(): Promise<void> {
    void execFile('copilot', ['login']);
  }
}
```

- [ ] **Step 4: Run the unit tests for adapter behavior**

Run: `npm run test:unit -- tests/unit/copilotAdapter.spec.ts`
Expected: PASS with parser and auth normalization tests green.

- [ ] **Step 5: Commit**

```bash
git add src/main/adapters/copilot/modelCatalog.ts src/main/adapters/copilot/copilotAdapter.ts src/main/ipc/registerIpc.ts src/shared/contracts.ts tests/unit/copilotAdapter.spec.ts
git commit -m "feat: add Copilot CLI adapter"
```

## Task 4: Add CAD_AI Session Management And Diagnostics

**Files:**
- Create: `src/main/services/diagnosticsStore.ts`
- Create: `src/main/adapters/cadAi/cadAiLocator.ts`
- Create: `src/main/adapters/cadAi/cadAiAdapter.ts`
- Create: `src/main/adapters/cadAi/drawingSessionService.ts`
- Create: `tests/integration/drawingSession.integration.spec.ts`
- Create: `tests/fixtures/site.dxf`
- Modify: `src/main/ipc/registerIpc.ts`
- Modify: `src/shared/contracts.ts`

- [ ] **Step 1: Write the failing drawing session integration test**

```ts
import { describe, expect, it } from 'vitest';
import { DrawingSessionService } from '../../src/main/adapters/cadAi/drawingSessionService';

describe('DrawingSessionService', () => {
  it('opens a DXF drawing and returns cache-backed session metadata', async () => {
    const service = new DrawingSessionService({
      cadAiRoot: 'D:/CAD/CAD_AI',
      diagnostics: { add: () => undefined }
    });

    const session = await service.openDrawing('tests/fixtures/site.dxf');

    expect(session.sourcePath).toMatch(/site\.dxf$/);
    expect(session.cachePath).toMatch(/site\.dxf\.cadqcache$/);
    expect(session.dxfPath).toMatch(/site\.dxf$/);
  });
});
```

- [ ] **Step 2: Run the integration test to verify it fails**

Run: `npm run test:integration -- tests/integration/drawingSession.integration.spec.ts`
Expected: FAIL with missing CAD_AI session service.

- [ ] **Step 3: Implement executable resolution, ingest, and diagnostics capture**

```ts
export function resolveCadAiCommand(cadAiRoot: string): { command: string; args: string[] } {
  const cadqExe = join(cadAiRoot, '.venv', 'Scripts', 'cadq.exe');
  const pythonExe = join(cadAiRoot, '.venv', 'Scripts', 'python.exe');

  if (existsSync(cadqExe)) return { command: cadqExe, args: [] };
  if (existsSync(pythonExe)) return { command: pythonExe, args: ['-c', 'from cadq.cli import app; app()'] };

  throw new Error(`Unable to locate CAD_AI executable under ${cadAiRoot}`);
}
```

```ts
export class DrawingSessionService {
  async openDrawing(filePath: string): Promise<DrawingSession> {
    const ingest = await this.cadAiAdapter.ingest(filePath);

    return {
      sourcePath: filePath,
      dxfPath: filePath.toLowerCase().endsWith('.dxf') ? filePath : ingest.dxfPath,
      cachePath: ingest.cachePath,
      openedAt: new Date().toISOString()
    };
  }
}
```

```ts
export class DiagnosticsStore {
  private readonly entries: DiagnosticEntry[] = [];

  add(entry: DiagnosticEntry): void {
    this.entries.unshift(entry);
    this.entries.splice(50);
  }

  list(): DiagnosticEntry[] {
    return [...this.entries];
  }
}
```

- [ ] **Step 4: Run the integration test with the real DXF fixture**

Run: `npm run test:integration -- tests/integration/drawingSession.integration.spec.ts`
Expected: PASS with CAD_AI ingest creating or reusing `tests/fixtures/site.dxf.cadqcache`.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/diagnosticsStore.ts src/main/adapters/cadAi/cadAiLocator.ts src/main/adapters/cadAi/cadAiAdapter.ts src/main/adapters/cadAi/drawingSessionService.ts src/main/ipc/registerIpc.ts src/shared/contracts.ts tests/integration/drawingSession.integration.spec.ts tests/fixtures/site.dxf
git commit -m "feat: add CAD_AI drawing session orchestration"
```

## Task 5: Build DXF Scene Normalization And Highlight Mapping

**Files:**
- Create: `src/main/adapters/viewer/dxfSceneBuilder.ts`
- Modify: `src/shared/viewerTypes.ts`
- Modify: `src/shared/contracts.ts`
- Test: `tests/unit/dxfSceneBuilder.spec.ts`

- [ ] **Step 1: Write the failing scene builder test**

```ts
import { describe, expect, it } from 'vitest';
import { buildSceneFromDxf } from '../../src/main/adapters/viewer/dxfSceneBuilder';

describe('buildSceneFromDxf', () => {
  it('creates SVG-ready primitives and handle indexes', async () => {
    const scene = await buildSceneFromDxf('tests/fixtures/site.dxf');

    expect(scene.entities.length).toBeGreaterThan(0);
    expect(scene.handleIndex).toHaveProperty('3D');
    expect(scene.bounds.maxX).toBeGreaterThan(scene.bounds.minX);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- tests/unit/dxfSceneBuilder.spec.ts`
Expected: FAIL with missing scene builder implementation.

- [ ] **Step 3: Implement a DXF-to-SVG scene builder with handle lookup**

```ts
export type ViewerEntity =
  | { kind: 'line'; id: string; handle: string; x1: number; y1: number; x2: number; y2: number; layer: string }
  | { kind: 'polyline'; id: string; handle: string; points: Array<[number, number]>; closed: boolean; layer: string }
  | { kind: 'circle'; id: string; handle: string; cx: number; cy: number; r: number; layer: string }
  | { kind: 'text'; id: string; handle: string; x: number; y: number; value: string; layer: string };
```

```ts
export async function buildSceneFromDxf(dxfPath: string): Promise<ViewerScene> {
  const parser = new DxfParser();
  const content = await fs.readFile(dxfPath, 'utf8');
  const doc = parser.parseSync(content);
  const entities = doc.entities.flatMap(normalizeEntity);

  return {
    entities,
    handleIndex: Object.fromEntries(entities.map((entity) => [entity.handle, entity.id])),
    bounds: computeBounds(entities)
  };
}
```

```ts
export function buildHighlightSet(scene: ViewerScene, handles: string[]): string[] {
  return handles
    .map((handle) => scene.handleIndex[handle])
    .filter((entityId): entityId is string => Boolean(entityId));
}
```

- [ ] **Step 4: Run the unit test to verify the scene builder passes**

Run: `npm run test:unit -- tests/unit/dxfSceneBuilder.spec.ts`
Expected: PASS with normalized primitives and handle lookup available.

- [ ] **Step 5: Commit**

```bash
git add src/main/adapters/viewer/dxfSceneBuilder.ts src/shared/viewerTypes.ts src/shared/contracts.ts tests/unit/dxfSceneBuilder.spec.ts
git commit -m "feat: add DXF scene normalization"
```

## Task 6: Build The Renderer Shell, Chat Flow, And Highlighted Viewer

**Files:**
- Create: `src/renderer/src/store/useAppStore.ts`
- Create: `src/renderer/src/components/TopBar.tsx`
- Create: `src/renderer/src/components/ChatPanel.tsx`
- Create: `src/renderer/src/components/DrawingCanvas.tsx`
- Create: `src/renderer/src/components/FeatureInspector.tsx`
- Create: `src/renderer/src/components/DiagnosticsPanel.tsx`
- Create: `src/renderer/src/styles.css`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/preload/index.ts`
- Modify: `src/main/ipc/registerIpc.ts`
- Test: `tests/unit/App.spec.tsx`

- [ ] **Step 1: Replace the shell test with a real interaction test**

```tsx
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/src/App';

describe('CAD UI workflow', () => {
  it('selects a model, opens a drawing, and applies chat highlights', async () => {
    window.cadUiApi = {
      loadBootstrap: vi.fn().mockResolvedValue({ authState: 'ready', models: ['gpt-5.4'], settings: { selectedModel: 'gpt-5.4', recentDrawings: [], lastDrawingPath: null, windowBounds: null } }),
      openDrawing: vi.fn().mockResolvedValue({ sourcePath: 'tests/fixtures/site.dxf', dxfPath: 'tests/fixtures/site.dxf', cachePath: 'tests/fixtures/site.dxf.cadqcache', scene: { entities: [{ id: 'entity-1', kind: 'line', handle: '3D', x1: 0, y1: 0, x2: 10, y2: 10, layer: 'SITE' }], handleIndex: { '3D': 'entity-1' }, bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 } } }),
      sendPrompt: vi.fn().mockResolvedValue({ text: 'Driveway boundary highlighted.', featureIds: ['driveway-1'], entityHandles: ['3D'], highlightMode: 'outline', evidence: [{ featureId: 'driveway-1', handle: '3D', source: 'cadq feature' }] })
    } as never;

    render(<App />);

    await waitFor(() => expect(screen.getByDisplayValue('gpt-5.4')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Open DWG' }));
    fireEvent.change(screen.getByPlaceholderText('Ask about the active drawing'), { target: { value: 'Where is the driveway?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(screen.getByText('Driveway boundary highlighted.')).toBeInTheDocument());
    expect(screen.getByTestId('entity-1')).toHaveAttribute('data-highlighted', 'true');
  });
});
```

- [ ] **Step 2: Run the UI test to verify it fails**

Run: `npm run test:unit -- tests/unit/App.spec.tsx`
Expected: FAIL because the renderer does not yet wire bootstrap, file open, chat send, or highlight state.

- [ ] **Step 3: Implement the real renderer state and SVG viewer**

```ts
type AppState = {
  authState: AuthState;
  models: string[];
  selectedModel: string | null;
  drawingSession: DrawingSession | null;
  scene: ViewerScene | null;
  highlightedEntityIds: string[];
  messages: Array<{ role: 'user' | 'assistant'; text: string; featureIds: string[] }>;
};
```

```tsx
export function DrawingCanvas({ scene, highlightedEntityIds }: { scene: ViewerScene | null; highlightedEntityIds: string[] }) {
  if (!scene) return <div className="canvas-empty">Open a drawing to view it.</div>;

  return (
    <svg viewBox={`${scene.bounds.minX} ${scene.bounds.minY} ${scene.bounds.maxX - scene.bounds.minX} ${scene.bounds.maxY - scene.bounds.minY}`}>
      {scene.entities.map((entity) => {
        const highlighted = highlightedEntityIds.includes(entity.id);
        if (entity.kind === 'line') {
          return <line key={entity.id} data-testid={entity.id} data-highlighted={String(highlighted)} x1={entity.x1} y1={entity.y1} x2={entity.x2} y2={entity.y2} className={highlighted ? 'entity entity-highlight' : 'entity'} />;
        }

        return null;
      })}
    </svg>
  );
}
```

```tsx
const onSend = async () => {
  const envelope = await window.cadUiApi.sendPrompt({
    model: state.selectedModel,
    prompt: input,
    drawingPath: state.drawingSession?.sourcePath ?? null,
    selectedEntityIds: state.highlightedEntityIds
  });

  setMessages((messages) => [...messages, { role: 'assistant', text: envelope.text, featureIds: envelope.featureIds }]);
  setHighlightedEntityIds(resolveHandlesToEntityIds(state.scene, envelope.entityHandles));
};
```

- [ ] **Step 4: Run the unit tests for renderer behavior**

Run: `npm run test:unit -- tests/unit/App.spec.tsx`
Expected: PASS with model bootstrap, prompt send, and highlight wiring verified.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/store/useAppStore.ts src/renderer/src/components/TopBar.tsx src/renderer/src/components/ChatPanel.tsx src/renderer/src/components/DrawingCanvas.tsx src/renderer/src/components/FeatureInspector.tsx src/renderer/src/components/DiagnosticsPanel.tsx src/renderer/src/styles.css src/renderer/src/App.tsx src/preload/index.ts src/main/ipc/registerIpc.ts tests/unit/App.spec.tsx
git commit -m "feat: add CAD UI renderer and highlight flow"
```

## Task 7: Add End-To-End Coverage, Diagnostics UX, And Project Docs

**Files:**
- Create: `e2e/cad-ui.e2e.ts`
- Modify: `README.md`
- Modify: `src/renderer/src/components/DiagnosticsPanel.tsx`
- Modify: `src/main/ipc/registerIpc.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing Electron E2E test**

```ts
import { _electron as electron, expect, test } from '@playwright/test';

test('persists model selection across restart', async () => {
  const app = await electron.launch({ args: ['.'] });
  const page = await app.firstWindow();

  await page.selectOption('[data-testid="model-select"]', 'gpt-5.4');
  await app.close();

  const reopened = await electron.launch({ args: ['.'] });
  const reopenedPage = await reopened.firstWindow();
  await expect(reopenedPage.locator('[data-testid="model-select"]')).toHaveValue('gpt-5.4');
  await reopened.close();
});
```

- [ ] **Step 2: Run the E2E test to verify it fails**

Run: `npm run test:e2e -- e2e/cad-ui.e2e.ts`
Expected: FAIL because the dev build does not yet start in Playwright with persistent model state.

- [ ] **Step 3: Finish diagnostics surfacing and document local prerequisites**

```md
## Local Prerequisites

- GitHub Copilot CLI installed and authenticated with `copilot login`
- Sibling project available at `D:\CAD\CAD_AI`
- `D:\CAD\CAD_AI\.venv\Scripts\cadq.exe` or `python.exe` present
- ODA File Converter installed for `.dwg` inputs; `.dxf` works without ODA

## Development

```powershell
npm install
npm run dev
```

## Tests

```powershell
npm run test:unit
npm run test:integration
npm run test:e2e
```
```

```tsx
export function DiagnosticsPanel({ entries }: { entries: DiagnosticEntry[] }) {
  return (
    <aside>
      <h2>Diagnostics</h2>
      <ul>
        {entries.map((entry) => (
          <li key={entry.timestamp}>
            <strong>{entry.source}</strong>
            <p>{entry.message}</p>
          </li>
        ))}
      </ul>
    </aside>
  );
}
```

- [ ] **Step 4: Run the full verification set**

Run: `npm run test:unit && npm run test:integration && npm run test:e2e`
Expected: PASS with unit, CAD_AI integration, and Electron persistence workflows green.

- [ ] **Step 5: Commit**

```bash
git add e2e/cad-ui.e2e.ts README.md src/renderer/src/components/DiagnosticsPanel.tsx src/main/ipc/registerIpc.ts package.json
git commit -m "test: add end-to-end coverage and setup docs"
```

## Task 8: Add Interactive Camera (Pan, Zoom, Fit, Fit-To-Selection)

**Files:**
- Create: `src/renderer/src/viewer/cameraState.ts`
- Create: `src/renderer/src/viewer/useCamera.ts`
- Modify: `src/renderer/src/components/DrawingCanvas.tsx`
- Modify: `src/renderer/src/store/useAppStore.ts`
- Modify: `src/renderer/src/styles.css`
- Test: `tests/unit/cameraState.spec.ts`
- Test: `tests/unit/DrawingCanvas.spec.tsx`

Goal: Replace the static `viewBox` with an interactive 2D camera that supports drag-to-pan, wheel-to-zoom (zoom-to-cursor), `Fit All`, and `Fit Selection`. Camera math is a pure module so it can be unit-tested without the DOM. The SVG renderer applies camera state through `viewBox`.

- [ ] **Step 1: Write failing camera-math tests**

```ts
import { describe, expect, it } from 'vitest';
import { applyPan, applyWheelZoom, fitBounds, initialCamera } from '../../src/renderer/src/viewer/cameraState';

describe('cameraState', () => {
  it('keeps the cursor world point stationary while zooming in', () => {
    const camera = initialCamera({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, { width: 200, height: 200 });
    const cursor = { screenX: 100, screenY: 100 };

    const zoomed = applyWheelZoom(camera, { ...cursor, deltaY: -100 }, { width: 200, height: 200 });

    expect(zoomed.zoom).toBeGreaterThan(camera.zoom);
    expect(zoomed.center.x).toBeCloseTo(camera.center.x, 5);
    expect(zoomed.center.y).toBeCloseTo(camera.center.y, 5);
  });

  it('translates the camera by screen-pixel deltas during pan', () => {
    const camera = { center: { x: 50, y: 50 }, zoom: 2 };
    const panned = applyPan(camera, { dxScreen: 10, dyScreen: -20 }, { width: 200, height: 200 });

    expect(panned.center.x).toBeCloseTo(50 - 10 / 2, 5);
    expect(panned.center.y).toBeCloseTo(50 + 20 / 2, 5);
  });

  it('fits a target bounds with margin into the viewport', () => {
    const camera = fitBounds({ minX: 0, minY: 0, maxX: 100, maxY: 50 }, { width: 400, height: 200 }, { marginRatio: 0.1 });

    expect(camera.center.x).toBeCloseTo(50, 5);
    expect(camera.center.y).toBeCloseTo(25, 5);
    expect(camera.zoom).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- tests/unit/cameraState.spec.ts`
Expected: FAIL because `cameraState` module does not exist.

- [ ] **Step 3: Implement the camera module and wire it into the canvas**

```ts
export type CameraState = { center: { x: number; y: number }; zoom: number };
export type ViewportSize = { width: number; height: number };

export function initialCamera(bounds: ViewerBounds, viewport: ViewportSize): CameraState {
  return fitBounds(bounds, viewport, { marginRatio: 0.05 });
}

export function applyPan(camera: CameraState, delta: { dxScreen: number; dyScreen: number }, viewport: ViewportSize): CameraState {
  return {
    zoom: camera.zoom,
    center: {
      x: camera.center.x - delta.dxScreen / camera.zoom,
      y: camera.center.y + delta.dyScreen / camera.zoom
    }
  };
}

export function applyWheelZoom(camera: CameraState, event: { screenX: number; screenY: number; deltaY: number }, viewport: ViewportSize): CameraState {
  const factor = Math.exp(-event.deltaY * 0.0015);
  const nextZoom = clampZoom(camera.zoom * factor);
  const worldBefore = screenToWorld(camera, viewport, { x: event.screenX, y: event.screenY });
  const next = { ...camera, zoom: nextZoom };
  const worldAfter = screenToWorld(next, viewport, { x: event.screenX, y: event.screenY });

  return {
    zoom: nextZoom,
    center: {
      x: camera.center.x + (worldBefore.x - worldAfter.x),
      y: camera.center.y + (worldBefore.y - worldAfter.y)
    }
  };
}

export function fitBounds(bounds: ViewerBounds, viewport: ViewportSize, options: { marginRatio: number }): CameraState {
  const width = Math.max(bounds.maxX - bounds.minX, 1e-6);
  const height = Math.max(bounds.maxY - bounds.minY, 1e-6);
  const margin = 1 + Math.max(0, options.marginRatio);
  const zoom = Math.min(viewport.width / (width * margin), viewport.height / (height * margin));

  return {
    zoom: clampZoom(zoom),
    center: { x: bounds.minX + width / 2, y: bounds.minY + height / 2 }
  };
}
```

```ts
export function useCamera(scene: ViewerScene | null) {
  const [viewport, setViewport] = useState<ViewportSize>({ width: 1, height: 1 });
  const [camera, setCamera] = useState<CameraState>(() => initialCamera(defaultBounds, viewport));

  const fitAll = useCallback(() => {
    if (scene?.bounds) setCamera(fitBounds(scene.bounds, viewport, { marginRatio: 0.05 }));
  }, [scene, viewport]);

  const fitSelection = useCallback((entityIds: string[]) => {
    const bounds = computeBoundsForEntities(scene, entityIds);
    if (bounds) setCamera(fitBounds(bounds, viewport, { marginRatio: 0.2 }));
  }, [scene, viewport]);

  return { camera, setCamera, viewport, setViewport, fitAll, fitSelection };
}
```

```tsx
const viewBox = useMemo(() => {
  const halfWidth = viewport.width / 2 / camera.zoom;
  const halfHeight = viewport.height / 2 / camera.zoom;
  return `${camera.center.x - halfWidth} ${camera.center.y - halfHeight} ${halfWidth * 2} ${halfHeight * 2}`;
}, [camera, viewport]);
```

The DOM canvas component listens for `wheel`, `mousedown`/`mousemove`/`mouseup`, and a `ResizeObserver` to keep `viewport` in sync. Y-axis sign is inverted between drawing space and SVG to match the existing renderer.

- [ ] **Step 4: Add a renderer interaction test for fit-to-selection**

```tsx
it('fits the viewport to the currently selected entity', async () => {
  const scene = makeFixtureScene();
  render(<DrawingCanvas scene={scene} highlightedEntityIds={[]} highlightMode="none" selectedEntityId="entity-far" showSurveyPoints={false} onSelectEntity={() => undefined} onToggleSurveyPoints={() => undefined} />);

  fireEvent.click(screen.getByRole('button', { name: 'Fit selection' }));

  await waitFor(() => {
    const svg = screen.getByRole('img', { name: 'Drawing canvas surface' });
    expect(svg.getAttribute('viewBox')).not.toBeNull();
  });
});
```

- [ ] **Step 5: Run the unit tests and verify camera math + UI pass**

Run: `npm run test:unit -- tests/unit/cameraState.spec.ts tests/unit/DrawingCanvas.spec.tsx`
Expected: PASS for camera math, fit, pan/zoom, and fit-to-selection.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/viewer/cameraState.ts src/renderer/src/viewer/useCamera.ts src/renderer/src/components/DrawingCanvas.tsx src/renderer/src/store/useAppStore.ts src/renderer/src/styles.css tests/unit/cameraState.spec.ts tests/unit/DrawingCanvas.spec.tsx
git commit -m "feat: interactive viewer camera with pan, zoom, fit"
```

## Task 9: Add Layer Panel (Visibility, Lock, Isolate, Persistence)

**Files:**
- Modify: `src/shared/viewerTypes.ts`
- Modify: `src/main/adapters/viewer/dxfSceneBuilder.ts`
- Create: `src/renderer/src/components/LayerPanel.tsx`
- Modify: `src/renderer/src/store/useAppStore.ts`
- Modify: `src/renderer/src/components/DrawingCanvas.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/styles.css`
- Modify: `src/main/services/settingsStore.ts`
- Modify: `src/shared/contracts.ts`
- Test: `tests/unit/dxfSceneBuilder.spec.ts`
- Test: `tests/unit/LayerPanel.spec.tsx`

Goal: Surface DWG layers as first-class UI. Each layer has visibility, lock, and isolate controls. Hidden layers do not render or hit-test. Locked layers render but are not selectable. Per-drawing layer state persists across restarts.

- [ ] **Step 1: Write the failing scene-builder layer test**

```ts
it('produces a layer index with default visibility, lock, and entity counts', async () => {
  const scene = await buildSceneFromDxf('tests/fixtures/site.dxf');

  const siteLayer = scene.layers.find((layer) => layer.id.toLowerCase() === 'site');
  expect(siteLayer).toBeDefined();
  expect(siteLayer?.visible).toBe(true);
  expect(siteLayer?.locked).toBe(false);
  expect(siteLayer?.entityCount).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Write the failing layer-panel UI test**

```tsx
it('hides entities when their layer is toggled off and isolates a single layer', () => {
  const scene = makeFixtureScene({ layers: ['SITE', 'GRID'] });
  const onChange = vi.fn();

  render(<LayerPanel layers={scene.layers} onChange={onChange} />);

  fireEvent.click(screen.getByRole('checkbox', { name: 'SITE visible' }));
  expect(onChange).toHaveBeenCalledWith({ id: 'SITE', patch: { visible: false } });

  fireEvent.click(screen.getByRole('button', { name: 'Isolate GRID' }));
  expect(onChange).toHaveBeenCalledWith({ id: 'GRID', patch: { isolate: true } });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:unit -- tests/unit/dxfSceneBuilder.spec.ts tests/unit/LayerPanel.spec.tsx`
Expected: FAIL because `scene.layers` and `LayerPanel` do not exist yet.

- [ ] **Step 4: Implement layer extraction, panel, store wiring, and persistence**

```ts
export type ViewerLayer = {
  id: string;
  name: string;
  color: string | null;
  visible: boolean;
  locked: boolean;
  entityCount: number;
};

export type ViewerScene = {
  drawingPath: string | null;
  bounds: ViewerBounds | null;
  focusBounds: ViewerBounds | null;
  entities: ViewerEntity[];
  layers: ViewerLayer[];
  handleIndex: ViewerHandleIndex;
};
```

```ts
function buildLayerIndex(entities: ViewerEntity[], dxfLayers: Record<string, IDxfLayer>): ViewerLayer[] {
  const counts = new Map<string, number>();
  for (const entity of entities) counts.set(entity.layer, (counts.get(entity.layer) ?? 0) + 1);

  return [...counts.keys()].sort().map((id) => ({
    id,
    name: id,
    color: dxfLayers[id]?.color ? `#${dxfLayers[id].color.toString(16).padStart(6, '0')}` : null,
    visible: dxfLayers[id]?.visible !== false,
    locked: false,
    entityCount: counts.get(id) ?? 0
  }));
}
```

```tsx
export function LayerPanel({ layers, onChange }: { layers: ViewerLayer[]; onChange: (change: { id: string; patch: Partial<ViewerLayer> & { isolate?: boolean } }) => void }) {
  return (
    <aside className="layer-panel" aria-label="Layers">
      <h2>Layers</h2>
      <ul>
        {layers.map((layer) => (
          <li key={layer.id} className={layer.visible ? 'layer' : 'layer layer--hidden'}>
            <input type="checkbox" aria-label={`${layer.id} visible`} checked={layer.visible} onChange={(event) => onChange({ id: layer.id, patch: { visible: event.target.checked } })} />
            <span className="layer__color" style={{ background: layer.color ?? '#888' }} />
            <span className="layer__name">{layer.id}</span>
            <span className="layer__count">{layer.entityCount}</span>
            <button type="button" aria-label={`Lock ${layer.id}`} onClick={() => onChange({ id: layer.id, patch: { locked: !layer.locked } })}>{layer.locked ? '🔒' : '🔓'}</button>
            <button type="button" aria-label={`Isolate ${layer.id}`} onClick={() => onChange({ id: layer.id, patch: { isolate: true } })}>Isolate</button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
```

The renderer applies layer visibility by filtering entities at draw time and skipping hit-testing on locked or hidden layers. Per-drawing layer state is stored in `AppSettings.drawingLayerState` keyed by absolute drawing path.

- [ ] **Step 5: Run the unit tests for layers and persistence**

Run: `npm run test:unit -- tests/unit/dxfSceneBuilder.spec.ts tests/unit/LayerPanel.spec.tsx tests/unit/settingsStore.spec.ts`
Expected: PASS with layer extraction, UI controls, and persistence verified.

- [ ] **Step 6: Commit**

```bash
git add src/shared/viewerTypes.ts src/shared/contracts.ts src/main/adapters/viewer/dxfSceneBuilder.ts src/main/services/settingsStore.ts src/renderer/src/components/LayerPanel.tsx src/renderer/src/components/DrawingCanvas.tsx src/renderer/src/store/useAppStore.ts src/renderer/src/App.tsx src/renderer/src/styles.css tests/unit/dxfSceneBuilder.spec.ts tests/unit/LayerPanel.spec.tsx tests/unit/settingsStore.spec.ts
git commit -m "feat: add layer panel with visibility, lock, isolate"
```

## Task 10: Add Box-Select (Window And Crossing Semantics)

**Files:**
- Create: `src/renderer/src/viewer/selectionHitTest.ts`
- Modify: `src/renderer/src/components/DrawingCanvas.tsx`
- Modify: `src/renderer/src/store/useAppStore.ts`
- Modify: `src/renderer/src/styles.css`
- Test: `tests/unit/selectionHitTest.spec.ts`
- Test: `tests/unit/DrawingCanvas.spec.tsx`

Goal: Hold left-mouse and drag on empty canvas to box-select. Left-to-right drag selects entities fully enclosed (window). Right-to-left drag selects any entity that crosses the box (crossing). Hidden and locked layers are excluded. The active selection drives `selectedEntityIds` for chat context.

- [ ] **Step 1: Write the failing hit-test math test**

```ts
import { describe, expect, it } from 'vitest';
import { selectInBox } from '../../src/renderer/src/viewer/selectionHitTest';

const entities = [
  { id: 'inside', layer: 'A', bounds: { minX: 5, minY: 5, maxX: 9, maxY: 9 } },
  { id: 'crossing', layer: 'A', bounds: { minX: 8, minY: 0, maxX: 12, maxY: 4 } },
  { id: 'outside', layer: 'A', bounds: { minX: 20, minY: 20, maxX: 30, maxY: 30 } },
  { id: 'hidden', layer: 'B', bounds: { minX: 1, minY: 1, maxX: 4, maxY: 4 } }
] as const;

describe('selectInBox', () => {
  const box = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  const layerVisibility = { A: { visible: true, locked: false }, B: { visible: false, locked: false } };

  it('window mode selects only fully enclosed entities on visible unlocked layers', () => {
    expect(selectInBox(entities, box, { mode: 'window', layerVisibility })).toEqual(['inside']);
  });

  it('crossing mode also selects entities that intersect the box', () => {
    expect(selectInBox(entities, box, { mode: 'crossing', layerVisibility })).toEqual(['inside', 'crossing']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- tests/unit/selectionHitTest.spec.ts`
Expected: FAIL because `selectionHitTest` does not exist.

- [ ] **Step 3: Implement the hit-test function and the SVG drag overlay**

```ts
export type SelectMode = 'window' | 'crossing';

export function selectInBox(
  entities: ReadonlyArray<{ id: string; layer: string; bounds: ViewerBounds }>,
  box: ViewerBounds,
  options: { mode: SelectMode; layerVisibility: Record<string, { visible: boolean; locked: boolean }> }
): string[] {
  return entities
    .filter((entity) => {
      const layer = options.layerVisibility[entity.layer];
      if (layer && (!layer.visible || layer.locked)) return false;
      return options.mode === 'window' ? isContained(entity.bounds, box) : intersects(entity.bounds, box);
    })
    .map((entity) => entity.id);
}
```

```tsx
// DrawingCanvas adds a transient <rect className="drawing-canvas__marquee" /> while dragging.
// On mouseup, it computes the world-space box, derives mode from drag direction,
// and calls actions.replaceSelection(selectInBox(...)).
```

- [ ] **Step 4: Write the failing renderer drag test**

```tsx
it('selects entities inside a window-drag box and updates highlights', async () => {
  const scene = makeFixtureScene({ withFarLeftEntity: true });
  const onSelect = vi.fn();
  render(<DrawingCanvas scene={scene} highlightedEntityIds={[]} highlightMode="none" selectedEntityId={null} showSurveyPoints={false} onSelectEntity={() => undefined} onToggleSurveyPoints={() => undefined} onBoxSelect={onSelect} />);

  const surface = screen.getByRole('img', { name: 'Drawing canvas surface' });
  fireEvent.mouseDown(surface, { clientX: 10, clientY: 10, button: 0 });
  fireEvent.mouseMove(surface, { clientX: 200, clientY: 200 });
  fireEvent.mouseUp(surface, { clientX: 200, clientY: 200 });

  await waitFor(() => expect(onSelect).toHaveBeenCalledWith({ entityIds: expect.any(Array), mode: 'window' }));
});
```

- [ ] **Step 5: Run the unit tests to verify they pass**

Run: `npm run test:unit -- tests/unit/selectionHitTest.spec.ts tests/unit/DrawingCanvas.spec.tsx`
Expected: PASS with hit-test, marquee rendering, and selection callback verified.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/viewer/selectionHitTest.ts src/renderer/src/components/DrawingCanvas.tsx src/renderer/src/store/useAppStore.ts src/renderer/src/styles.css tests/unit/selectionHitTest.spec.ts tests/unit/DrawingCanvas.spec.tsx
git commit -m "feat: add box-select with window and crossing semantics"
```

## Spec Coverage Check

- Copilot CLI auth and model use: covered by Task 3 and Task 6.
- Persistent model selection on restart: covered by Task 2 and Task 7.
- DWG/DXF file selection and CAD_AI integration: covered by Task 4.
- 2D drawing rendering: covered by Task 5 and Task 6.
- Chat-triggered highlighting by stable references: covered by Task 5 and Task 6.
- Clear diagnostics and failure states: covered by Task 4 and Task 7.
- Interactive viewer navigation (pan, zoom, fit, fit-to-selection): covered by Task 8.
- Layer visibility, lock, and isolation: covered by Task 9.
- Box-select with window/crossing semantics for chat context: covered by Task 10.

## Placeholder Scan

No `TBD`, `TODO`, or deferred implementation markers are left in the task list. Deferred items from the spec remain intentionally out of scope for this first plan.

## Type Consistency Check

- Assistant responses use `AssistantEnvelope` consistently across main, preload, and renderer.
- Viewer entities resolve through `entityHandles` to `ViewerScene.handleIndex`, then to renderer `highlightedEntityIds`.
- Persisted model state remains `selectedModel` across settings, preload, and renderer.