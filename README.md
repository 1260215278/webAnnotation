# webAnnotation

AI-first web annotation toolkit for turning page feedback into structured code-change context.

`webAnnotation` lets a host web app enter annotation mode, select a DOM element, write a note, and submit an `AnnotationPayload v1` to a configured backend. The long-term goal is to connect those payloads to AI patch generation, PR/MR review, and local CLI patch workflows.

> Status: early MVP in development. The runtime SDK, React source metadata Vite plugin, Node protocol kit, and local examples exist in this repository; npm packages are not published yet.

## Current MVP

The repository currently includes:

- `@web-annotation/core`: browser Runtime SDK.
- `@web-annotation/vite`: Vite plugin for React JSX/TSX source metadata.
- `@web-annotation/node`: Node-side protocol kit for payload validation and AI patch context.
- `apps/platform-starter`: a minimal HTTP ingest API (plus a bilingual static task console) that validates payloads, stores tasks, collects repo source context, and proposes mock patches.
- `examples/playground`: a minimal Vite page for local verification.
- `examples/vite-react`: a React + Vite example showing DOM-to-source payloads.
- TypeScript typecheck, unit tests, and build scripts.

The SDK currently supports:

- `createAnnotator(options)`.
- `enable()`, `disable()`, `isEnabled()`, `mountWidget()`, `destroy()`.
- Hover highlight and click-to-lock target selection.
- A small floating textarea next to the locked element.
- `Enter` to submit, `Shift+Enter` for newline, `Esc` to cancel.
- `submitAnnotation(payload)` custom submission.
- `endpoint` + optional `getAuthToken()` POST submission.
- `AnnotationPayload v1` with project, page, target selector, CSS path, element text, rect, and sanitized DOM snapshot.
- Optional `target.source` when source metadata has been injected by the Vite plugin.

The Vite plugin currently supports:

- React JSX/TSX intrinsic HTML element metadata injection.
- `mode: "source"` for file, line, column, component, framework, and sourceId.
- `mode: "safe"` for browser payloads that include only anonymous sourceId.
- `mode: "disabled"` to skip source metadata injection.
- `include` / `exclude` filters.
- An in-memory manifest callback for mapping sourceId back to source locations on the backend side.

The Node protocol kit currently supports:

- `validateAnnotationPayload(input)` / `assertAnnotationPayload(input)`: runtime validation of `AnnotationPayload v1` with readable issues.
- `validateSourceManifest(input)`: runtime validation of a sourceId-to-location manifest.
- `resolvePayloadSources(payload, manifest)`: enrich safe-mode payloads from a trusted manifest without mutating the input.
- `buildPatchPromptContext(payload, options?)`: a deterministic, serializable summary for AI patch prompts.
- `collectRepoSourceContext(promptContext, options)`: safely read repo source snippets referenced by `source.file`/`line`, with path-traversal/oversize/binary protection and readable issues.

The Platform Starter ingest API currently supports:

- `GET /health`: liveness check.
- `POST /api/annotations`: validate a payload (optionally `{ payload, manifest }`), resolve safe-mode sources, store a task, and return `{ taskId, status }`.
- `GET /api/tasks`: list task summaries (including `status`, source-context counts, and any `patchProposalId`).
- `GET /api/tasks/:id`: fetch task detail, including the generated prompt context, any source context, and any patch proposal.
- `POST /api/tasks/:id/source-context`: collect repository source snippets for a task when the server is configured with a repo root.
- `POST /api/tasks/:id/mock-patch`: generate a deterministic mock patch proposal, moving the task to `patch_proposed` (idempotent).
- `GET /` and `GET /console`: a minimal bilingual static-HTML task console for browsing tasks, viewing details, collecting source context, and triggering mock patches.
- In-memory task store behind a `TaskStore` interface, and a testable `createPlatformServer()` factory.

Still planned:

- Screenshot capture.
- Vue SFC source metadata injection.
- Real AI patch generation (replacing the mock) and a production-grade task-console workflow.
- Persistent storage for the platform.
- CLI patch workflow.
- npm publishing.

## Install Locally

```sh
pnpm install
```

Run the verification suite:

```sh
pnpm run typecheck
pnpm run test
pnpm run build
```

Run the playground:

```sh
pnpm example
```

Then open the printed local URL, enable annotation mode, select an element, type a note, and press `Enter`. The submitted payload appears in the page and in the console.

Run the React source metadata example:

```sh
pnpm example:react
```

The React example uses the Vite plugin and shows submitted payloads with `annotations[].target.source`.

## Runtime SDK Usage

Use the SDK when you want to collect annotation payloads and send them to your own backend.

```ts
import { createAnnotator } from "@web-annotation/core"

const annotator = createAnnotator({
  projectId: "web-console",
  environment: "staging",
  endpoint: "https://your-api.example.com/annotations",
  getAuthToken: async () => "short-lived-token",
  capture: {
    domSnapshot: true
  }
})

annotator.mountWidget()
```

For advanced integrations, the host app can fully control submission:

```ts
const annotator = createAnnotator({
  projectId: "web-console",
  environment: "staging",
  submitAnnotation: async (payload) => {
    await yourGateway.post("/annotations", payload)
  }
})

annotator.enable()
```

## API

```ts
const annotator = createAnnotator(options)

annotator.enable()
annotator.disable()
annotator.isEnabled()
annotator.mountWidget()
annotator.destroy()
```

### `AnnotatorOptions`

```ts
interface AnnotatorOptions {
  projectId: string
  environment?: string
  release?: string
  commit?: string
  endpoint?: string
  getAuthToken?: () => string | Promise<string>
  submitAnnotation?: (payload: AnnotationPayload) => void | Promise<void>
  capture?: {
    domSnapshot?: boolean
    screenshot?: boolean
    sourceMetadata?: "auto" | "disabled"
  }
}
```

`submitAnnotation` takes precedence over `endpoint`. If neither is provided, submitting an annotation throws a configuration error.

`capture.screenshot` is reserved for a planned package. `capture.sourceMetadata` defaults to `"auto"` and reads metadata only when a build plugin has injected it into the DOM.

## Vite Plugin Usage

Use the Vite plugin when you want annotations to carry enough context for an AI or backend service to find the source component.

```ts
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { annotationPlugin } from "@web-annotation/vite"

export default defineConfig({
  plugins: [
    annotationPlugin({
      mode: "source"
    }),
    react()
  ]
})
```

Production-oriented safe mode keeps real file paths and line numbers out of the browser payload:

```ts
annotationPlugin({
  mode: "safe",
  onManifest: (manifest) => {
    // Store this on your backend or emit it into your own build artifact.
    console.log(manifest)
  }
})
```

Mode behavior:

- `source`: browser DOM and payload include `sourceId`, `file`, `line`, `column`, `component`, and `framework`.
- `safe`: browser DOM and payload include only `sourceId`; the manifest keeps the full mapping for trusted code.
- `disabled`: no source attributes are injected; the Runtime SDK still works with selector and DOM snapshot context.

## Node Protocol Kit Usage

Use the Node kit on your backend or AI layer to validate incoming payloads, resolve safe-mode sources against a trusted manifest, and build deterministic prompt context. It never calls AI APIs, reads model keys, or touches a Git provider.

```ts
import {
  assertAnnotationPayload,
  resolvePayloadSources,
  buildPatchPromptContext,
} from "@web-annotation/node"

// 1. Validate the payload received from the browser (throws on invalid input).
const payload = assertAnnotationPayload(requestBody)

// 2. In safe mode the browser only sent `sourceId`; resolve it with your manifest.
const resolved = resolvePayloadSources(payload, sourceManifest)

// 3. Build a stable, serializable context for an AI patch prompt.
const context = buildPatchPromptContext(resolved, { maxDomSnapshotLength: 2000 })
```

`validateAnnotationPayload` returns `{ ok: true, payload }` or `{ ok: false, issues }` instead of throwing. `validateSourceManifest` validates the manifest emitted by `@web-annotation/vite`. The safe-mode manifest stays on the trusted backend; it is never shipped to the browser.

When a prompt context carries `source.file`/`line`, `collectRepoSourceContext` reads the relevant source snippets from a local checkout — a building block for a future AI patch step. It calls no AI, generates no diff, and never modifies files:

```ts
import { collectRepoSourceContext } from "@web-annotation/node"

const { files, issues } = collectRepoSourceContext(context, {
  rootDir: "/abs/path/to/repo",
  contextLines: 20,      // lines before/after the annotated line(s)
  maxFiles: 8,           // cap distinct files read
  maxBytesPerFile: 65536 // skip oversized files
})
// files[i] = { file (relative), startLine, endLine, content, annotations }
```

Safety is enforced: only relative paths from the context are accepted; absolute paths, empty paths, and `..` traversal that escapes `rootDir` are rejected; the same file is read once; missing, oversized, or binary files (null-byte detection) become `issues` instead of throwing; and the returned `file` is always repository-relative — absolute paths are used only for internal reads, never surfaced to prompt-facing content. For tests, `readFile`/`fileExists` can be injected.

## Platform Starter (Ingest API)

`apps/platform-starter` is a minimal HTTP ingest service built on Node's built-in `http` and the Node protocol kit. It receives payloads, validates them, resolves safe-mode sources, collects source snippets from a configured local repo, and stores tasks in memory. It performs no AI calls and uses no database.

Run it locally:

```sh
pnpm --filter @web-annotation/platform-starter dev
# defaults to http://localhost:4319 (override with PORT)
```

Enable repo source-context collection by pointing the starter at a local checkout:

```sh
WEB_ANNOTATION_REPO_ROOT=/abs/path/to/your/repo pnpm --filter @web-annotation/platform-starter dev
# REPO_ROOT is also supported when WEB_ANNOTATION_REPO_ROOT is not set.
```

Then open the task console at `http://localhost:4319/console` (also served at `/`). The console is a single static HTML page (vanilla JS, no framework) with Chinese/English UI switching. It lists tasks, shows a task's payload/prompt-context detail, triggers source-context collection, triggers `mock-patch` for tasks without a proposal, and renders source snippets, source issues, proposal `summary`, `suggestedFiles`, and `diffPreview`. Use it for local verification instead of `curl`.

Endpoints:

- `GET /` or `GET /console` → the task console HTML page.
- `GET /health` → `{ ok: true }`.
- `POST /api/annotations` → body is either a bare `AnnotationPayload v1` or `{ payload, manifest }`. Returns `201 { taskId, status }`, or `400 { error, issues }` on invalid input.
- `GET /api/tasks` → `{ tasks: TaskSummary[] }`.
- `GET /api/tasks/:id` → `{ task }`, or `404` when the id is unknown.
- `POST /api/tasks/:id/source-context` → collect repo snippets for the task using the configured repo root. Returns `201 { taskId, sourceContext }` on first collection and `200` on repeat calls, refreshing the stored source context each time; `409 { error }` when `repoRoot` is not configured; `404` when the id is unknown.
- `POST /api/tasks/:id/mock-patch` → generate a mock patch proposal. Returns `201 { taskId, status, patchProposal }` on first call and `200` with the same proposal on repeats (idempotent); `404` when the id is unknown.

A task summary includes `sourceContextStatus`, `sourceFileCount`, and `sourceIssueCount`. `sourceContext.files[].file` stays repository-relative; absolute paths are not returned. Source-context collection reads files only through the Node kit safety checks and still performs no AI call, diff generation, repository write, or Git operation.

A task moves through `received → patch_proposed`. The `patchProposal` carries a deterministic `summary`, `suggestedFiles` (the source file when known, otherwise the element's `cssPath`/`selector`), and a readable mock `diffPreview`. It is a stand-in for the planned AI patch step: no AI is called and mock patch generation does not read or modify repository files.

The server is exposed as a factory for tests and embedding:

```ts
import { createPlatformServer } from "@web-annotation/platform-starter"

const { server, store } = createPlatformServer({
  repoRoot: "/abs/path/to/your/repo"
})
server.listen(4319)
```

## Payload Shape

Payload example:

```json
{
  "version": "v1",
  "project": {
    "projectId": "web-console",
    "environment": "staging"
  },
  "page": {
    "url": "https://app.example.com/settings",
    "route": "/settings",
    "title": "Settings",
    "viewport": {
      "width": 1440,
      "height": 900
    }
  },
  "annotationGroup": {
    "id": "group_...",
    "mode": "single"
  },
  "annotations": [
    {
      "id": "anno_...",
      "message": "Change this button text to Save settings",
      "createdAt": "2026-06-28T00:00:00.000Z",
      "target": {
        "selector": "[data-annotation-id='el_...']",
        "cssPath": "#save",
        "tagName": "button",
        "text": "Submit",
        "rect": {
          "x": 111,
          "y": 319,
          "width": 74,
          "height": 34
        },
        "domSnapshot": "<button id=\"save\" data-annotation-id=\"el_...\">Submit</button>",
        "source": {
          "mode": "source",
          "sourceId": "s_19cu8m6",
          "file": "src/App.tsx",
          "line": 25,
          "column": 9,
          "component": "App",
          "framework": "react"
        }
      }
    }
  ]
}
```

`source` is omitted when no build plugin is present, when the plugin is disabled, or when runtime capture sets `sourceMetadata: "disabled"`.

## Planned Ecosystem

```text
packages/
  annotation-core/       Runtime SDK for browser annotation
  annotation-vite/       Current Vite plugin for React source metadata
  annotation-node/       Current Node protocol kit: validation, source resolution, prompt context
  annotation-cli/        Planned local patch pull/apply workflow

apps/
  platform-starter/      Current minimal HTTP ingest API + bilingual static task console
                         + repo source-context collection
examples/
  playground/            Current local SDK verification page
  vite-react/            Current React source metadata verification page
```

## AI Patch Direction

The intended full workflow is:

```text
select DOM -> write annotation -> submit payload -> backend stores task
-> collect repo source context -> AI proposes patch -> human reviews
-> PR/MR or CLI apply
```

The browser SDK does not include model keys, repository tokens, or backend secrets. AI and repository access belong on the configured backend or platform layer.

## Safety Principles

- The browser SDK must not contain model keys, repository tokens, or backend secrets.
- DOM snapshots should be sanitized before submission.
- Production source metadata should default to safe or disabled modes.
- AI-generated patches must be reviewed by a human.
- PR/MR and CLI delivery should verify repository identity and base commit.

## Development Log

See [log.md](./log.md) for concise project milestones.

## License

License is not selected yet.
