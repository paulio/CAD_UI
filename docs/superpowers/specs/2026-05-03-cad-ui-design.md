# CAD UI Design

## Summary

CAD_UI will be a Windows-first Electron desktop application that uses the user's existing GitHub Copilot CLI authentication for AI access and treats `D:\CAD\CAD_AI` as a local external engine. The application will let the user choose a DWG drawing, establish a drawing session backed by CAD_AI ingest artifacts, render a 2D view of the drawing, and drive chat answers that can highlight drawing components in the viewer.

The first release prioritizes a practical, reliable local workflow over full CAD fidelity. The UI will persist the selected model across restarts and will anchor viewer highlights to stable CAD_AI feature IDs or entity handles, with label-based references treated only as a convenience path.

## Goals

- Provide a desktop UI for AI-assisted exploration of CAD drawings.
- Reuse the user's existing GitHub Copilot CLI login instead of building a new auth system.
- Allow the user to choose a Copilot-backed model and restore that choice on restart.
- Allow the user to choose a DWG file and pass it into the CAD_AI tooling flow.
- Render a usable 2D representation of the drawing in the app.
- Make AI answers visually actionable by highlighting referenced geometry in the viewer.

## Non-Goals

- Full AutoCAD-grade DWG rendering fidelity in the first release.
- Cross-platform support in the first release.
- Re-implementing CAD_AI classification, ingest, or ontology logic inside CAD_UI.
- Designing a general-purpose cloud sync or multi-user collaboration system.

## Constraints

- First release targets Windows only.
- CAD_UI uses GitHub Copilot CLI for authentication and model-backed chat access.
- CAD_UI integrates with CAD_AI by spawning its existing local CLI or MCP-capable processes, not by directly importing CAD_AI internals.
- The rendering stack must support a practical MVP now and a higher-fidelity upgrade path later.

## Chosen Approach

The application will follow an Electron shell plus local orchestration model:

1. Electron main process owns filesystem access, local settings, Copilot CLI orchestration, and CAD_AI process execution.
2. Electron renderer hosts the chat UI, model picker, file controls, viewer, and feature inspector.
3. Adapter modules in the main process provide stable orchestration boundaries for Copilot CLI, CAD_AI, and viewer scene preparation.

This approach is preferred because it keeps the first version straightforward to package and operate on Windows while preserving a clean integration boundary with the sister project.

## Architecture

### Main Process

The Electron main process will be the only layer that can:

- open DWG files from disk
- persist user and session settings
- resolve and invoke Copilot CLI
- resolve and invoke CAD_AI commands
- manage IPC to and from the renderer

This process should contain no view logic beyond coordinating events and returning structured results.

### Renderer Process

The renderer hosts the product interface and should include:

- top-level shell and layout
- model selection UI
- auth status presentation
- file open and session controls
- chat transcript and prompt input
- 2D viewer and highlight overlays
- optional feature detail inspector

The renderer must not invoke Copilot CLI or CAD_AI directly. It communicates only through typed IPC contracts exposed by the main process.

### Adapter Modules

Three adapter boundaries will structure the orchestration layer:

- `copilotAdapter`: checks auth, enumerates models, selects models, executes prompts, and streams or returns assistant responses.
- `cadAiAdapter`: establishes drawing sessions, invokes ingest and query flows, and resolves stable feature IDs, handles, and evidence.
- `viewerAdapter`: prepares normalized 2D scene data and translates feature references into viewer highlight instructions.

These adapters should return normalized application types rather than raw command output.

## Data Flow

### Startup

On startup, the app will:

1. load persisted settings
2. verify Copilot CLI availability and auth state
3. restore the last selected model if it still exists
4. restore recent drawing metadata if available

If the stored model no longer exists, the app will fall back to a valid default model and tell the user once.

### Model Selection

The model picker is populated from Copilot CLI. When the user changes the model:

- the selected model becomes active immediately
- the choice is persisted to local settings immediately
- that persisted value is restored on the next app launch

### Drawing Session Creation

When the user opens a DWG file, the main process will:

1. store the drawing path in the session state
2. invoke CAD_AI ingest or resume existing cached artifacts when possible
3. establish a drawing session root containing the source path and derived artifacts such as converted DXF, `.cadqcache`, viewer scene data, and metadata needed for highlighting

The app should treat a drawing session as the unit of orchestration for chat, rendering, and result linking.

### Viewer Load

The renderer will receive normalized scene data for a practical 2D viewing experience. Version one should support:

- pan and zoom
- fit to view
- pointer hover and click selection
- programmatic highlight overlays
- a baseline level of layer and geometry rendering sufficient for user orientation

The initial rendering model may simplify some DWG semantics, but it must preserve enough geometry structure to let users confirm what the AI is referring to.

### Chat And Highlight Flow

Each prompt to the AI layer should include:

- user message text
- selected model
- active drawing session context
- relevant CAD_AI query context
- optional current viewer selection

The returned assistant payload must be structured, not plain text. The normalized response envelope should include:

- assistant text for display
- referenced `featureIds`
- optional entity handles
- evidence metadata
- highlight intent such as `focus`, `pulse`, `outline`, or `zoomTo`

The renderer will display the answer text and apply any returned highlight instructions to the viewer. Feature mentions in the chat transcript should also be clickable so users can reapply the same highlight and camera behavior.

## Highlighting Contract

Stable feature identifiers are authoritative. Free-text labels may be accepted as a convenience path, but the UI should not trust them as the primary linking mechanism.

Rules:

- use stable CAD_AI feature IDs or entity handles when available
- allow label-based references only when they can be resolved safely
- if a response is ambiguous, show the text but mark visual linking as partial
- never highlight the wrong geometry confidently

This contract protects the user from false precision in dense drawings.

## UI And Interaction Model

The drawing is the primary surface. The first-release layout will use three main zones:

- top bar: current file, model picker, auth state, and primary drawing/session actions
- left panel: chat transcript, prompt input, result references, and AI status
- main canvas: 2D drawing viewer with navigation and highlights

An optional right-side inspector may be added for selected feature details such as:

- semantic type
- source layer
- feature ID or entity handle
- evidence from CAD_AI
- AI explanation or summary

Core interactions:

- opening a DWG establishes or resumes a drawing session
- selecting a model updates active AI state and persists settings
- sending a prompt may include the current viewer selection as context
- clicking a feature in chat highlights and focuses the drawing
- clicking geometry in the viewer can seed follow-up prompts such as asking what the selected item is or what is adjacent to it

When an answer references multiple features, the UI should surface them as an explicit clickable result set rather than forcing the user to infer them from prose.

## Persistence

The app should persist at least:

- last selected model
- recent drawing paths
- last opened drawing metadata
- window and layout preferences

Per-drawing chat history can be deferred if needed, but the architecture should not block adding it later.

## Error Handling

### Auth Errors

If Copilot CLI is missing, expired, or unauthenticated, the app should show a blocked AI state with specific remediation rather than a vague failure message. Model selection remains visible but disabled until auth succeeds.

### CAD Ingest Errors

The app must separate drawing load failures from semantic analysis failures. If one can proceed without the other, the UI should say so instead of collapsing everything into a single generic error.

### Process Failures

The orchestration layer should capture and normalize:

- executable resolution failures
- non-zero exit codes
- stderr summaries
- timeouts
- parse failures on command output

Those diagnostics should be visible in an app-level diagnostics surface suitable for local development and troubleshooting.

### Highlight Resolution Errors

If the assistant payload includes labels without resolvable stable IDs, the app may still show the answer but should communicate that visual linking is incomplete.

### Persistence Errors

Settings corruption or stale model data must degrade gracefully. The app should recover to defaults rather than failing startup.

## Testing Strategy

### Unit Tests

Unit coverage should include:

- settings persistence and model restore
- Copilot auth status parsing
- CAD_AI process wrappers
- normalization of assistant payloads into structured highlightable responses
- viewer highlight state transitions

### Integration Tests

Integration tests should cover the local workflow against fixture drawings or controlled sample data:

- opening a drawing session
- triggering CAD_AI ingest
- loading normalized viewer scene data
- issuing a known question
- receiving stable references in the response payload
- applying those references to viewer state

### End-To-End Desktop Tests

End-to-end tests should validate the critical user journey:

- first launch without auth
- successful auth detection
- model selection persistence after restart
- opening a DWG
- asking a supported question
- clicking a referenced feature in chat
- seeing the correct viewer highlight behavior

## Acceptance Criteria For First Release

- The app detects Copilot CLI auth state and blocks AI use clearly when unavailable.
- The selected model persists across app restarts.
- The user can choose a DWG file and establish a working drawing session.
- The app renders a usable 2D drawing view with navigation controls.
- At least one supported CAD_AI-backed query path returns stable references.
- Referenced geometry can be highlighted in the viewer from chat results.
- Failures are explained clearly enough for a developer or early user to act on them.

## Future Evolution

The design should leave room for:

- richer viewer fidelity and more complete DWG presentation
- a local backend service if orchestration becomes too complex for the main process
- deeper CAD_AI integration if direct module access becomes worth the packaging cost
- per-drawing conversation continuity and richer result evidence panels

## Open Decisions Deferred Intentionally

These are intentionally deferred from the design because they do not change the architectural direction for the first implementation plan:

- exact viewer library choice
- exact IPC transport shape
- whether streaming assistant responses are implemented in the first increment or second
- whether the feature inspector ships in the very first milestone or immediately after