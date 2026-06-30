# @web-annotation/core

Browser runtime SDK for web annotation. Lets a user point at a DOM element, write
a note (optionally attaching screenshots), and submit a deterministic
`AnnotationPayload v1` to your backend.

> Status: prepared for the first npm publish (`0.1.0`); not yet published at the
> time of this commit. Part of the [webAnnotation](https://github.com/1260215278/webAnnotation)
> monorepo.

## Install

Once published:

```sh
pnpm add @web-annotation/core
```

## Usage

```ts
import { createAnnotator } from "@web-annotation/core"

const annotator = createAnnotator({
  projectId: "my-app",
  submitAnnotation: async (payload) => {
    await fetch("/api/annotations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
  },
})

annotator.enable() // hover to highlight, click to lock, Enter to submit, Esc to cancel
```

### Image attachments (optional)

The payload never carries raw image bytes. Images are uploaded out-of-band; the
payload only references the stored object. Provide an uploader:

```ts
createAnnotator({
  projectId: "my-app",
  submitAnnotation,
  attachments: {
    images: true,
    // uploadImage takes precedence over uploadEndpoint
    uploadImage: async (file, context) => {
      // upload to your server/object storage and return a stored reference
      return {
        id: crypto.randomUUID(),
        kind: "image",
        name: file.name,
        mimeType: file.type,
        size: file.size,
        storage: { provider: "server", url: "https://cdn.example.com/..." },
      }
    },
  },
})
```

## License

MIT
