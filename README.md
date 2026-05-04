# CAD_UI

CAD_UI is a Windows-first Electron desktop app for opening CAD drawings, sending focused prompts through GitHub Copilot CLI, and surfacing CAD_AI diagnostics and drawing highlights in a renderer shell. It is the UI-focused companion to the sister project [cadq](https://github.com/paulio/cadq).

> The Electron app source currently lives on the `feature/cad-ui-implementation` branch (also checked out under [.worktrees/cad-ui-implementation/](.worktrees/cad-ui-implementation/)). The commands below are run from that working tree.

## Prerequisites

- Windows 10/11
- Node.js 22.x with `npm` on `PATH`
- GitHub Copilot CLI installed and authenticated with `copilot login`
- The sibling CAD_AI project available at `D:\CAD\CAD_AI`
- Either `D:\CAD\CAD_AI\.venv\Scripts\cadq.exe` or a usable Python environment for the CAD_AI fallback path
- ODA File Converter installed if you need `.dwg` ingestion; `.dxf` inputs work without ODA

## Install

```powershell
cd .worktrees\cad-ui-implementation
npm install
```

## Run the app (development)

```powershell
npm run dev
```

`electron-vite dev` builds the main, preload, and renderer bundles and launches Electron with hot reload. Settings (selected Copilot model, recent drawings, window bounds) are persisted to the Electron `userData` directory and restored on next launch.

## Run the app (production build)

```powershell
npm run build
npm run preview
```

`build` emits the renderer to `dist/` and the main/preload bundles to `dist-electron/`. `preview` launches the packaged Electron entry point against those build outputs.

## Tests

```powershell
npm run test:unit          # vitest, all unit specs
npm run test:integration   # vitest, integration specs only
npm run test:e2e           # builds, then runs Playwright Electron E2E
```

`test:e2e` performs a fresh build before launching Playwright against the packaged Electron app.

## Using the app

1. Launch with `npm run dev`.
2. Pick a Copilot model from the top bar (the choice is persisted).
3. Click **Open DWG** and select a `.dwg` or `.dxf` file. DWG inputs are auto-converted to DXF via the CAD_AI `oda` command.
4. Use the viewer to navigate the drawing, the layer panel to control visibility, and the chat panel to ask CAD_AI-backed questions.

### Viewer controls

| Action | Input |
|---|---|
| Pan | Right-mouse drag, or middle-mouse drag, or **Shift** + left-mouse drag |
| Zoom | Mouse wheel (zooms toward the cursor) |
| Fit all | Toolbar **Fit all** button |
| Fit selection | Toolbar **Fit selection** (active when an entity or AI highlight is selected) |
| Click-select an entity | Left-click on geometry |
| Box-select (window) | Left-drag empty canvas left → right (selects entities fully inside) |
| Box-select (crossing) | Left-drag empty canvas right → left (selects entities the box touches) |
| Toggle survey points | "Show survey points" checkbox in the viewer header |

### Layer panel

- Per-layer visibility toggle, lock toggle, and **Isolate** to show only one layer.
- **Show all** restores every layer's visibility.
- Locked layers render but are not selectable; hidden layers are not rendered or hit-tested.

### Chat & highlights

Sending a prompt forwards the current model, drawing path, and current selection to the Copilot CLI through the main process. Assistant responses arrive as a structured envelope (text + feature IDs + entity handles + highlight mode) and the renderer applies the highlight to the corresponding viewer entities. Click a referenced feature in the chat transcript to replay the highlight.

## Architecture

- **Main process** (`src/main/`) owns filesystem access, settings persistence, Copilot CLI orchestration, CAD_AI subprocess execution, and DXF scene normalization.
- **Preload bridge** (`src/preload/`) exposes a typed `window.cadUiApi` surface — the renderer never touches Electron or Node internals directly.
- **Renderer** (`src/renderer/`) is a React app: top bar, chat panel, drawing canvas (SVG, with a pure camera math module and box-select hit-test), layer panel, feature inspector, diagnostics.
- **Shared contracts** (`src/shared/`) define the IPC request/response types and viewer scene types.

See [docs/superpowers/specs/2026-05-03-cad-ui-design.md](docs/superpowers/specs/2026-05-03-cad-ui-design.md) for the full design and [docs/superpowers/plans/2026-05-03-cad-ui-implementation-plan.md](docs/superpowers/plans/2026-05-03-cad-ui-implementation-plan.md) for the task-by-task implementation plan.

## Troubleshooting

- **AI status shows `cli-missing` or `reauth-required`** — run `copilot login` from a Windows terminal, then restart the app. The diagnostics panel surfaces the underlying CLI error.
- **Drawing fails to open** — check the diagnostics panel for the CAD_AI command and stderr. DWG inputs require the ODA File Converter to be on `PATH` (used by CAD_AI's `oda convert`).
- **Stale settings** — settings live under `%APPDATA%\cad-ui\settings.json`. Delete the file to reset to defaults; the app degrades gracefully on corrupt input.