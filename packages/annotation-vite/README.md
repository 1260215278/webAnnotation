# @web-annotation/vite

Vite plugin that injects React (JSX/TSX) source metadata so annotated DOM
elements can be mapped back to their source location. Pairs with
[`@web-annotation/core`](https://www.npmjs.com/package/@web-annotation/core).

> Status: published on npm as `@web-annotation/vite@0.1.0`. Part of the [webAnnotation](https://github.com/1260215278/webAnnotation)
> monorepo.

## Install

```sh
pnpm add -D @web-annotation/vite
```

## Usage

```ts
// vite.config.ts
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { annotationPlugin } from "@web-annotation/vite"

export default defineConfig({
  plugins: [
    react(),
    annotationPlugin({ mode: "source" }), // "source" | "safe" | "disabled"
  ],
})
```

- `source`: inject DOM attributes and allow the payload to expose
  file/line/column/component/sourceId.
- `safe`: the browser payload only exposes `sourceId`; real paths and
  line/column stay server-side (resolve them with `@web-annotation/node`).
- `disabled`: no source metadata; the runtime stays fully usable.

Only Vite + React JSX/TSX is supported today. Vue SFC source mapping is still
planned.

## License

MIT
