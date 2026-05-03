# CAD_UI

CAD_UI is a Windows-first Electron desktop app for opening CAD drawings, sending focused prompts through GitHub Copilot CLI, and surfacing CAD_AI diagnostics and drawing highlights in a renderer shell.

## Local prerequisites

- Node.js 22.x with npm available on PATH
- GitHub Copilot CLI installed and authenticated with `copilot login`
- The sibling CAD_AI project available at `D:\CAD\CAD_AI`
- Either `D:\CAD\CAD_AI\.venv\Scripts\cadq.exe` or a usable Python environment for the CAD_AI fallback path
- ODA File Converter installed if you need `.dwg` ingestion; `.dxf` inputs work without ODA

## Install

```powershell
npm install
```

## Development

```powershell
npm run dev
```

The Electron main process persists settings under the app user-data directory. The selected Copilot model should survive app restarts.

## Tests

Run the standard verification set:

```powershell
npm run test:unit
npm run test:integration
npm run test:e2e -- e2e/cad-ui.e2e.ts
npm run build
```

The E2E suite launches the built Electron app through Playwright. `npm run test:e2e` performs a fresh build before the test run so the desktop flow is exercised against current sources.

## Project notes

- Drawings are opened through the Electron main process, which owns filesystem access, CAD_AI execution, and diagnostics capture.
- Copilot model discovery and prompt execution happen in the main process and are exposed to the renderer through typed IPC.
- Diagnostics shown in the renderer cover bootstrap failures, Copilot prompt failures, CAD_AI pipeline events surfaced by the main process, and viewer scene build failures.