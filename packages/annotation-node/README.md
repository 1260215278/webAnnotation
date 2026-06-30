# @web-annotation/node

Node-side protocol kit for web annotation. Validate `AnnotationPayload v1`,
resolve safe-mode source ids back to file/line via a manifest, read repository
source context safely, and build a deterministic AI patch prompt context.

> Status: prepared for the first npm publish (`0.1.0`); not yet published at the
> time of this commit. Part of the [webAnnotation](https://github.com/1260215278/webAnnotation)
> monorepo.

## Install

Once published:

```sh
pnpm add @web-annotation/node
```

## Usage

```ts
import {
  assertAnnotationPayload,
  buildPatchPromptContext,
  resolvePayloadSources,
  validateSourceManifest,
} from "@web-annotation/node"

// throws AnnotationPayloadError with readable issues on invalid input
const payload = assertAnnotationPayload(requestBody)

// optional: resolve safe-mode source ids using a build manifest
const manifest = validateSourceManifest(manifestInput)
const resolved = resolvePayloadSources(payload, manifest)

// deterministic, serializable context for an AI patch provider
const promptContext = buildPatchPromptContext(resolved)
```

`collectRepoSourceContext(promptContext, { rootDir })` reads only the relative
source files referenced by the payload, rejecting absolute paths, `..` escapes,
binary files, and oversized files. It never exposes absolute paths to
prompt-facing content.

## License

MIT
