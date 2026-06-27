# webAnnotation

AI-first web annotation toolkit for turning page feedback into code changes.

`webAnnotation` is a planned npm ecosystem for adding Codex-like page annotation to third-party web apps. It lets a user enter annotation mode, select a DOM element, write feedback, and send structured context to a backend. With the optional build plugin and platform starter, the backend can map the selected element back to source code, ask AI to generate a patch, and deliver the change through a PR/MR or a local CLI flow.

> Status: early design and repository initialization. Packages are not published yet.

## What It Is For

`webAnnotation` is designed for product, QA, design, and engineering teams that want feedback to stay attached to the exact UI element being discussed.

Typical use cases:

- Annotate a live or staging page and send the target DOM context to your own backend.
- Capture page URL, route, selected element, DOM snippet, screenshot, and source metadata in one payload.
- Let an AI service use the annotation plus source metadata to propose code changes.
- Review AI-generated diffs before creating a PR/MR or applying a patch locally.

The core idea is simple:

```text
select DOM -> write annotation -> submit payload -> AI proposes patch -> human reviews -> PR or CLI apply
```

## Product Shape

The project is planned as a layered ecosystem. Each layer should be usable on its own.

```text
packages/
  annotation-core/       Runtime SDK for browser annotation
  annotation-vite/       Vite plugin for React/Vue source metadata
  annotation-node/       Backend helpers and payload validation
  annotation-cli/        Local patch pull/apply workflow

apps/
  platform-starter/      Self-hosted annotation and AI patch console
  examples/
    vite-react/
    vite-vue/
```

## Planned Usage

### 1. Runtime SDK Only

Use this when you want to collect annotation payloads and send them to your own backend.

```ts
import { createAnnotator } from "@web-annotation/core"

const annotator = createAnnotator({
  projectId: "web-console",
  environment: "staging",
  endpoint: "https://your-api.example.com/annotations",
  getAuthToken: async () => "short-lived-token",
  capture: {
    screenshot: true,
    domSnapshot: true,
    sourceMetadata: "auto"
  }
})

annotator.enable()
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
```

### 2. Optional Widget

The SDK will be API-first. Host apps can build their own entry point, or mount a default widget for quick setup.

```ts
annotator.mountWidget()
```

### 3. Vite Source Metadata Plugin

Use the Vite plugin when you want AI to map an annotated DOM element back to source files.

```ts
import { annotationPlugin } from "@web-annotation/vite"

export default defineConfig({
  plugins: [
    annotationPlugin({
      projectId: "web-console",
      frameworks: ["react", "vue"],
      mode: process.env.NODE_ENV === "production" ? "safe" : "source",
      include: ["src/**/*.{tsx,jsx,vue}"],
      exclude: ["**/*.test.*", "**/*.stories.*"]
    })
  ]
})
```

Planned modes:

- `source`: for local, test, and staging environments. Payloads can include file, line, column, component, and framework.
- `safe`: for production. Browser payloads expose anonymous source IDs instead of source paths.
- `disabled`: no source metadata injection. The SDK still works as a regular annotation collector.

## Payload Shape

The submitted payload is planned to include:

- `project`: project ID, environment, release, commit.
- `page`: URL, route, title, viewport.
- `annotationGroup`: single annotation by default, batch-ready for future multi-point feedback.
- `annotations`: message, selector, element text, rectangle, sanitized DOM snapshot, screenshot reference, source metadata.

Example:

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
    "viewport": {
      "width": 1440,
      "height": 900
    }
  },
  "annotationGroup": {
    "id": "generated-id",
    "mode": "single"
  },
  "annotations": [
    {
      "message": "Change this button text to Save settings",
      "target": {
        "selector": "[data-annotation-id='...']",
        "text": "Submit",
        "source": {
          "mode": "source",
          "framework": "react",
          "file": "src/pages/settings/index.tsx",
          "line": 88,
          "column": 12,
          "component": "SettingsForm"
        }
      }
    }
  ]
}
```

## Self-hosted Platform Starter

The planned platform starter provides an end-to-end reference implementation:

- Ingest annotation payloads.
- Show annotation tasks, screenshots, DOM snippets, and source metadata.
- Read repository context.
- Generate AI patch candidates.
- Require human review before delivery.
- Create PR/MR after approval.
- Provide a CLI fallback for local patch application.

## CLI Patch Flow

For teams that do not want to grant repository write access to the platform:

```sh
npx @web-annotation/cli pull TASK_ID
```

The CLI will verify the local repository, branch, and base commit before applying a patch.

## Safety Principles

- The browser SDK must not contain model keys, repository tokens, or backend secrets.
- Production mode must not expose source paths, line numbers, or component names by default.
- DOM snapshots should be sanitized before submission.
- AI-generated patches must be reviewed by a human.
- PR/MR and CLI delivery should verify repository identity and base commit.

## Roadmap

- [ ] Initialize npm monorepo.
- [ ] Build runtime annotation SDK.
- [ ] Add Vite React source metadata injection.
- [ ] Add Vite Vue source metadata injection.
- [ ] Define and validate `AnnotationPayload v1`.
- [ ] Build Node backend helper package.
- [ ] Build self-hosted platform starter.
- [ ] Add PR/MR delivery.
- [ ] Add CLI patch workflow.
- [ ] Publish npm packages.

## Development Log

See [log.md](./log.md) for concise project milestones.

## License

License is not selected yet.
