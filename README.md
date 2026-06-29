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
- `GET /api/tasks`: list task summaries (including `status`, source-context counts, any `patchProposalId`, and any `patchReviewStatus`).
- `GET /api/tasks/:id`: fetch task detail, including the generated prompt context, any source context, patch proposal, and patch review.
- `POST /api/tasks/:id/source-context`: collect repository source snippets for a task when the server is configured with a repo root.
- `POST /api/tasks/:id/patch`: call an injected patch provider to create a patch proposal (idempotent).
- `POST /api/tasks/:id/mock-patch`: generate a deterministic mock patch proposal, moving the task to `patch_proposed` (idempotent).
- `POST /api/tasks/:id/patch-review`: record a human `accept` / `reject` / `changes_requested` decision on a proposal (records the decision only; never applies the patch).
- `GET /api/tasks/:id/patch-artifact`: export a `web-annotation.patch-artifact.v1` JSON artifact for downstream CLI/Git/AI apply workflows (export only; never writes files). When `repoRoot` is configured the artifact's existing `project.commit` field carries the current repo `HEAD`, so the CLI can run a base-commit preflight.
- `GET /` and `GET /console`: a minimal bilingual static-HTML task console for browsing tasks, viewing details, collecting source context, triggering provider/mock patches, reviewing proposals, and viewing patch artifacts.
- `createHttpPatchProvider(options)`: a generic HTTP adapter for connecting an external AI/custom patch service.
- Shared patch-provider result runtime validation for both direct injected providers and the HTTP provider adapter.
- In-memory task store behind a `TaskStore` interface, and a testable `createPlatformServer()` factory.

Still planned:

- Screenshot capture.
- Vue SFC source metadata injection.
- Model-specific provider adapters and a production-grade task-console workflow.
- Persistent storage for the platform.
- CLI push and PR/MR delivery (the CLI currently pulls an exported artifact over HTTP, previews artifacts, runs apply dry-run/preflight, checks patch applicability, applies to the working tree with explicit confirmation, and can apply on a new local branch with a local commit).
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

To keep an AI/custom provider's `diffPreview` from secretly editing files outside what it declared, the kit ships a unified-diff target safety helper. It runs no git, applies no patch, and reads no repository files:

```ts
import {
  collectUnifiedDiffTargetFiles,
  validateUnifiedDiffTargetFiles,
} from "@web-annotation/node"

// Enumerate the repository files a diff would touch (sorted, unique).
collectUnifiedDiffTargetFiles(diff) // => { ok: true, files } | { ok: false, issues }

// Reject any target outside the allow-list (e.g. a proposal's suggestedFiles).
validateUnifiedDiffTargetFiles(diff, ["src/App.tsx"]) // => { ok, files } | { ok: false, issues }
```

It parses both `diff --git a/… b/…` extended headers and plain `--- a/…` / `+++ b/…` headers, skips hunk bodies via exact line counts (so content lines such as `--- something` are never misread as file headers), ignores `/dev/null` while keeping the real path of added/deleted files, and rejects absolute paths, `..` traversal, and empty file names with readable `issues`.

## Platform Starter (Ingest API)

`apps/platform-starter` is a minimal HTTP ingest service built on Node's built-in `http` and the Node protocol kit. It receives payloads, validates them, resolves safe-mode sources, collects source snippets from a configured local repo, calls an optional host-provided patch provider, and stores tasks in memory. It ships no built-in model provider and uses no database.

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

When `repoRoot` is configured, the starter also stamps the exported patch artifact's existing `project.commit` field with the repository's current `HEAD`, read through a read-only `git -C <repoRoot> rev-parse HEAD`. This lets the CLI verify repo identity via its base-commit preflight before applying. The commit read is the only git use here: the starter still never applies patches, writes files, commits, or pushes. If the commit cannot be read (e.g. `repoRoot` is not a git repository), `GET /api/tasks/:id/patch-artifact` returns `409 { error: "failed to read repo head commit" }` rather than exporting a fake commit. When `repoRoot` is not set, the export succeeds without adding `project.commit`.

Enable an external HTTP patch provider:

```sh
WEB_ANNOTATION_PATCH_PROVIDER_URL=https://your-ai-backend.example.com/web-annotation/patch \
WEB_ANNOTATION_PATCH_PROVIDER_TOKEN=server-side-provider-token \
pnpm --filter @web-annotation/platform-starter dev
```

`PATCH_PROVIDER_TOKEN` is also supported when `WEB_ANNOTATION_PATCH_PROVIDER_TOKEN` is not set.

Then open the task console at `http://localhost:4319/console` (also served at `/`). The console is a single static HTML page (vanilla JS, no framework) with Chinese/English UI switching. It lists tasks, shows a task's payload/prompt-context detail, triggers source-context collection, triggers provider-backed `patch` or deterministic `mock-patch` for tasks without a proposal, renders source snippets, source issues, proposal `summary`, `suggestedFiles`, and `diffPreview`, records review decisions, and displays exported patch artifact JSON. Use it for local verification instead of `curl`.

Endpoints:

- `GET /` or `GET /console` → the task console HTML page.
- `GET /health` → `{ ok: true }`.
- `POST /api/annotations` → body is either a bare `AnnotationPayload v1` or `{ payload, manifest }`. Returns `201 { taskId, status }`, or `400 { error, issues }` on invalid input.
- `GET /api/tasks` → `{ tasks: TaskSummary[] }`.
- `GET /api/tasks/:id` → `{ task }`, or `404` when the id is unknown.
- `POST /api/tasks/:id/source-context` → collect repo snippets for the task using the configured repo root. Returns `201 { taskId, sourceContext }` on first collection and `200` on repeat calls, refreshing the stored source context each time; `409 { error }` when `repoRoot` is not configured; `404` when the id is unknown.
- `POST /api/tasks/:id/patch` → call `patchProvider.generatePatch({ task, promptContext, sourceContext })`. Returns `201 { taskId, status, patchProposal }` on first success and `200` with the same proposal on repeats; `409 { error }` when no provider is configured; `502 { error, message }` when the provider fails or returns an invalid result; `404` when the id is unknown. Before storing, the provider result is runtime-validated (`summary`, `suggestedFiles`, `diffPreview`, and optional `metadata`) and then the provider's `diffPreview` is checked with the Node kit's `validateUnifiedDiffTargetFiles` against its `suggestedFiles`; a diff that touches an undeclared file, an absolute path, or `..` traversal is rejected with `422 { error: "patch provider returned an unsafe diff", issues }` and no proposal is saved.
- `POST /api/tasks/:id/mock-patch` → generate a mock patch proposal. Returns `201 { taskId, status, patchProposal }` on first call and `200` with the same proposal on repeats (idempotent); `404` when the id is unknown.
- `POST /api/tasks/:id/patch-review` → body `{ decision: "accept" | "reject" | "changes_requested", reviewer?, note? }`. Records the decision as `patchReview` and moves the task to `patch_accepted` / `patch_rejected` / `changes_requested`. Returns `200 { taskId, status, patchReview }`; `404` when the id is unknown; `409 { error }` when the task has no patch proposal; `400 { error }` for an invalid or missing decision. A repeat review overrides the previous decision (the latest decision wins).
- `GET /api/tasks/:id/patch-artifact` → export `{ artifact }` with `version: "web-annotation.patch-artifact.v1"`, task metadata, prompt annotations, optional source context, `patchProposal`, optional `patchReview`, and safety flags `{ appliesPatch: false, writesFiles: false, requiresHumanReview: true }`. Returns `404` when the id is unknown and `409 { error }` when the task has no patch proposal. Repeat calls regenerate `exportedAt` while reading the stored proposal/review/task data.

A task summary includes `sourceContextStatus`, `sourceFileCount`, and `sourceIssueCount`. `sourceContext.files[].file` stays repository-relative; absolute paths are not returned. Source-context collection reads files only through the Node kit safety checks and still performs no AI call, diff generation, repository write, or Git operation.

A task moves through `received → patch_proposed → patch_accepted | patch_rejected | changes_requested`. The `patchProposal` carries `summary`, `suggestedFiles`, `diffPreview`, `promptContext`, and optional provider `metadata`. The built-in mock path is deterministic and reads no files; the provider path receives `promptContext` and any collected `sourceContext`, validates the returned result shape at runtime, and checks `diffPreview` so it can only touch files inside its own `suggestedFiles` (invalid results and unsafe diffs are rejected and never stored), but the starter package itself still does not include model keys, model SDKs, repository writes, or Git operations. A `patchReview` (`status`, `decidedAt`, optional `reviewer`/`note`) records the human decision only. A patch artifact packages task/proposal/review/source-context data for future apply flows, and its safety flags explicitly state that this starter does not apply patches or write files.

The HTTP provider adapter sends:

```json
{
  "taskId": "task_...",
  "task": {},
  "promptContext": {},
  "sourceContext": {}
}
```

The external provider should return:

```json
{
  "summary": "Short proposal summary",
  "suggestedFiles": ["src/App.tsx"],
  "diffPreview": "--- a/src/App.tsx\n+++ b/src/App.tsx\n...",
  "metadata": {
    "provider": "your-provider"
  }
}
```

The provider result contract is strict and shared by direct injected providers and `createHttpPatchProvider()`: `summary` and `diffPreview` must be non-empty strings, `suggestedFiles` must be a non-empty array of non-empty strings, and `metadata` must be an object when present. Invalid results return a readable `patch provider response is invalid` error and do not create a proposal.

`WEB_ANNOTATION_PATCH_PROVIDER_TOKEN` is sent only from the Platform Starter server to your provider as `Authorization: Bearer ...`; it is not exposed by the browser Runtime SDK.

The server is exposed as a factory for tests and embedding:

```ts
import { createHttpPatchProvider, createPlatformServer } from "@web-annotation/platform-starter"

const { server, store } = createPlatformServer({
  repoRoot: "/abs/path/to/your/repo",
  patchProvider: createHttpPatchProvider({
    endpoint: "https://your-ai-backend.example.com/web-annotation/patch",
    getAuthToken: async () => "server-side-provider-token"
  })
})
server.listen(4319)
```

## CLI Pull, Preview, Dry-run, Check, Apply, And Branch Commit

`packages/annotation-cli` (`@web-annotation/cli`, bin `web-annotation`) is a minimal local CLI for the `web-annotation.patch-artifact.v1` JSON artifact exported by the Platform Starter's `GET /api/tasks/:id/patch-artifact`. It can pull that artifact over HTTP, preview it, run apply dry-run/preflight and patch-check, apply it with explicit confirmation, and create an explicit local branch/commit. It never pushes or opens a PR/MR.

```sh
# build the CLI, then pull an exported artifact from a running Platform Starter
pnpm --filter @web-annotation/cli build
node packages/annotation-cli/dist/main.js pull <task-id> \
  --base-url http://localhost:4319 --out ./artifact.json

# preview a saved artifact
node packages/annotation-cli/dist/main.js preview --file ./artifact.json

# check whether the artifact is safe to plan against the current clean git repo
node packages/annotation-cli/dist/main.js apply --file ./artifact.json --dry-run

# verify the diff preview with git apply --check, still without writing files
node packages/annotation-cli/dist/main.js apply --file ./artifact.json --check

# apply the patch to the current working tree after explicit confirmation
node packages/annotation-cli/dist/main.js apply --file ./artifact.json --yes

# apply on a new local branch and create a local commit (no push, no PR)
node packages/annotation-cli/dist/main.js apply --file ./artifact.json --yes \
  --branch webannotation/task-example --commit --message "Apply reviewed patch"
```

`pull <task-id> --base-url <platform-url> --out <artifact.json>` requests `<platform-url>/api/tasks/<task-id>/patch-artifact` and saves the artifact locally. The `--base-url` must be an `http:` or `https:` URL (anything else exits non-zero without making a request). An optional `--token <token>` is sent as `Authorization: Bearer <token>` and never appears in any output, including errors. The response (the platform wraps it as `{ artifact }`) is validated with the same `validatePatchArtifactInput()` used by `preview`; a non-2xx response, invalid JSON, or a failed validation exits non-zero and writes nothing. On success it writes the bare artifact JSON to `--out` (so `preview --file` can read it back) and prints a deterministic pull report: task id and status, out file, suggested files, review status, and the `appliesPatch: false` / `writesRepoFiles: false` / `createsCommit: false` safety flags. `pull` never applies the patch, runs git, creates a branch/commit, pushes, or opens a PR/MR.

`preview --file <artifact.json>` validates the minimal artifact shape before printing:

- `version` must equal `web-annotation.patch-artifact.v1`.
- `taskId` and `taskStatus` must be present.
- `patchProposal.summary`, `patchProposal.suggestedFiles`, and `patchProposal.diffPreview` must be present.
- `safety.appliesPatch === false`, `safety.writesFiles === false`, and `safety.requiresHumanReview === true` (the export-only contract).

On success it exits `0` and prints a deterministic preview: task id and status, project id, route, proposal summary, suggested files, review status (`unreviewed` when the artifact has no `patchReview`), and the `diffPreview`. On a missing file, invalid JSON, or any failed validation it prints a readable error to stderr and exits non-zero.

`apply --file <artifact.json> --dry-run` reuses the same artifact validation, then runs a read-only git preflight: it checks the current directory is inside a git repository, reads the repo root, and requires `git status --short` to be empty. It also validates every `patchProposal.suggestedFiles` entry as a repo-relative path, rejecting empty paths, absolute paths, and `..` traversal. A successful dry-run prints the repo root, base commit status, suggested files, review status, safety flags (`appliesPatch: false`, `writesFiles: false`, `createsCommit: false`), and the `diffPreview` as preview text only.

`apply --file <artifact.json> --check` reuses the same validation and preflight, enforces the base commit and diff-target safety checks described below, then sends `patchProposal.diffPreview` to `git apply --check`. A passing check prints the repo root, base commit status, suggested files, review status, `Patch check: passed`, and the same no-write safety flags. A failing check exits non-zero with the `git apply --check` error. This command still does not write files or update git state.

`apply --file <artifact.json> --yes` (without `--commit`) is the first command that writes to the current working tree. It requires a clean git repository, validates paths, enforces the base commit and diff-target safety checks, runs `git apply --check`, and then runs `git apply`. It does not run `git add`, create a branch, create a commit, push, or open a PR/MR. Use `--dry-run` or `--check` first when reviewing an artifact manually.

Base commit preflight: if the artifact includes the existing `project.commit` field, every apply path (`--dry-run`, `--check`, `--yes`, and `--commit`) reads the local `HEAD` via `git rev-parse HEAD` and requires it to match before `git apply --check`, `git apply`, `git switch -c`, `git add`, or `git commit` can run. A match is reported as `Base commit: matched` with expected/current commits. A mismatch exits non-zero with a readable expected/current error and performs no write operation. If `project.commit` is absent, the CLI does not fail, but reports `Base commit: not provided` so the user knows repo identity was not verified.

Diff-target safety check: before any `git apply --check` or `git apply`, every apply command (`--check`, `--yes`, and `--commit`) enumerates the files the diff would actually touch and requires that set to equal the normalized `suggestedFiles`. `git apply` honours both `diff --git a/… b/…` extended headers and plain unified-diff `---`/`+++` file headers, so the check parses all of them (hunk bodies are skipped via exact line counts to avoid misreading content lines) and rejects any diff that targets a file outside `suggestedFiles`. This prevents an artifact from declaring one file while smuggling edits to another.

`apply --file <artifact.json> --yes --branch <branch-name> --commit --message <commit-message>` extends confirmed apply into an explicit local branch + commit. `--commit` requires both `--branch` and `--message`; omitting either exits non-zero. The branch name is rejected when it is empty, padded or contains whitespace, starts with `-`, or contains `..` or a backslash, and `src/main.ts` also runs `git check-ref-format --branch` as a final guard. The `--message` is taken verbatim and is rejected when it contains a `Co-Authored-By` or `Generated with` AI-signature trailer; the CLI never invents a default message. Before any write it reuses artifact validation, suggested-file path safety, the clean-repo preflight, the base commit preflight, the diff-target safety check (covering both `diff --git` and plain `---`/`+++` headers), and `git apply --check`, so an unexpected file is never applied or committed. The git write operations are limited to `git switch -c <branch>`, `git apply`, `git add -- <suggested files>`, and `git commit -m <message>`; it never runs `git push`, `git pull`, `git checkout`, `git reset`, or any PR/MR command. On success it prints a deterministic branch/commit report including the branch name, base commit status, committed files, `Patch check: passed`, `Patch apply: applied`, `Git add: staged selected files`, `Git commit: created`, and the explicit `push: false` / `createsPr: false` safety flags.

The core logic is exposed as pure functions for embedding and testing: `validatePatchArtifactInput(input)`, `formatPatchArtifactPreview(artifact)`, `formatApplyDryRunPlan(input)`, `formatPatchCheckReport(input)`, `formatApplyReport(input)`, `formatBranchCommitReport(input)`, `formatPullReport(input)`, `runPreviewCommand(args, deps)`, `runPullCommand(args, deps)`, `runApplyDryRunCommand(args, deps)`, `runApplyCheckCommand(args, deps)`, `runApplyConfirmedCommand(args, deps)`, and `runCliCommand(args, deps)`. `runPullCommand` takes injected `fetchArtifact`/`writeFile` deps so the network and filesystem stay out of the testable core. Apply commands take an injected current commit reader so base commit matching remains testable. `src/main.ts` only adapts `process.argv`/`stdout`/`stderr`, the real `fetch` and file write for `pull`, three read-only git commands (`rev-parse --show-toplevel`, `status --short`, `rev-parse HEAD`), the no-write `git apply --check`, confirmed `git apply` for `--yes`, and the `git check-ref-format` / `git switch -c` / `git add` / `git commit` writes for `--commit`. Push and PR/MR delivery remain planned.

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
  annotation-cli/        Current local CLI: pulls artifacts over HTTP, previews, runs dry-run/check, applies with explicit --yes, and can branch + local-commit (push/PR still planned)

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
