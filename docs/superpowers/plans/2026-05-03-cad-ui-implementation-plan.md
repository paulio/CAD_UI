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

## Spec Coverage Check

- Copilot CLI auth and model use: covered by Task 3 and Task 6.
- Persistent model selection on restart: covered by Task 2 and Task 7.
- DWG/DXF file selection and CAD_AI integration: covered by Task 4.
- 2D drawing rendering: covered by Task 5 and Task 6.
- Chat-triggered highlighting by stable references: covered by Task 5 and Task 6.
- Clear diagnostics and failure states: covered by Task 4 and Task 7.

## Placeholder Scan

No `TBD`, `TODO`, or deferred implementation markers are left in the task list. Deferred items from the spec remain intentionally out of scope for this first plan.

## Type Consistency Check

- Assistant responses use `AssistantEnvelope` consistently across main, preload, and renderer.
- Viewer entities resolve through `entityHandles` to `ViewerScene.handleIndex`, then to renderer `highlightedEntityIds`.
- Persisted model state remains `selectedModel` across settings, preload, and renderer.