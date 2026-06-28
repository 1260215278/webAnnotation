# webAnnotation

AI-first web annotation toolkit for turning page feedback into structured code-change context.

`webAnnotation` lets a host web app enter annotation mode, select a DOM element, write a note, and submit an `AnnotationPayload v1` to a configured backend. The long-term goal is to connect those payloads to AI patch generation, PR/MR review, and local CLI patch workflows.

> Status: early MVP in development. The runtime SDK, React source metadata Vite plugin, and local examples exist in this repository; npm packages are not published yet.

## Current MVP

The repository currently includes:

- `@web-annotation/core`: browser Runtime SDK.
- `@web-annotation/vite`: Vite plugin for React JSX/TSX source metadata.
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

Still planned:

- Screenshot capture.
- Vue SFC source metadata injection.
- Node helper package.
- CLI patch workflow.
- Self-hosted AI patch platform.
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
  annotation-node/       Planned backend helpers and payload validation
  annotation-cli/        Planned local patch pull/apply workflow

apps/
  platform-starter/      Planned self-hosted annotation and AI patch console
examples/
  playground/            Current local SDK verification page
  vite-react/            Current React source metadata verification page
```

## AI Patch Direction

The intended full workflow is:

```text
select DOM -> write annotation -> submit payload -> backend stores task
-> AI proposes patch -> human reviews -> PR/MR or CLI apply
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
