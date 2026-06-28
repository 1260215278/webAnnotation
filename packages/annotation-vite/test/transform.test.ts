import { describe, expect, it } from "vitest"
import { SOURCE_ATTR } from "@web-annotation/core"
import type { Plugin } from "vite"
import { annotationPlugin } from "../src/plugin"
import { transformReactSource } from "../src/transform"
import { makeSourceId } from "../src/ids"
import type { SourceManifest } from "../src/types"

const sample = `
export function App() {
  return (
    <div className="root">
      <Header title="hi" />
      <>
        <button onClick={save}>Save</button>
      </>
    </div>
  )
}
`

type TransformHook = (this: unknown, code: string, id: string) => unknown | Promise<unknown>

function getTransform(plugin: Plugin): TransformHook {
  const hook = plugin.transform
  if (typeof hook === "function") return hook as TransformHook
  if (hook && typeof hook === "object" && "handler" in hook) {
    return hook.handler as TransformHook
  }
  throw new Error("plugin has no transform hook")
}

describe("transformReactSource (source mode)", () => {
  it("injects source metadata onto intrinsic HTML tags only", () => {
    const out = transformReactSource({
      code: sample,
      filename: "src/App.tsx",
      mode: "source",
      typescript: true,
    })

    const tags = out.entries.map((e) => e.tag).sort()
    expect(tags).toEqual(["button", "div"])
    // Components and Fragments are skipped.
    expect(out.entries.find((e) => e.tag === "Header")).toBeUndefined()

    const div = out.entries.find((e) => e.tag === "div")!
    expect(div).toMatchObject({
      file: "src/App.tsx",
      component: "App",
      framework: "react",
    })
    expect(div.line).toBeGreaterThan(0)
    expect(div.column).toBeGreaterThan(0)
    expect(div.sourceId).toBe(makeSourceId("src/App.tsx", div.line, div.column))

    // Code carries the full attribute set in source mode.
    expect(out.code).toContain(SOURCE_ATTR.id)
    expect(out.code).toContain(SOURCE_ATTR.file)
    expect(out.code).toContain(SOURCE_ATTR.line)
    expect(out.code).toContain(SOURCE_ATTR.component)
    expect(out.code).toContain('src/App.tsx')
  })
})

describe("transformReactSource (safe mode)", () => {
  it("emits only the anonymous id and mode, never file/line/component", () => {
    const out = transformReactSource({
      code: sample,
      filename: "src/App.tsx",
      mode: "safe",
      typescript: true,
    })

    // Manifest still records real locations for the backend...
    expect(out.entries.length).toBe(2)
    expect(out.entries[0].file).toBe("src/App.tsx")

    // ...but the emitted browser code must not leak them.
    expect(out.code).toContain(SOURCE_ATTR.id)
    expect(out.code).toContain(`${SOURCE_ATTR.mode}="safe"`)
    expect(out.code).not.toContain(SOURCE_ATTR.file)
    expect(out.code).not.toContain(SOURCE_ATTR.line)
    expect(out.code).not.toContain(SOURCE_ATTR.component)
    expect(out.code).not.toContain("src/App.tsx")
  })
})

describe("transformReactSource (member/namespace skipping)", () => {
  it("skips <Foo.Bar/> member expressions and capitalized components", () => {
    const out = transformReactSource({
      code: `export const View = () => <Foo.Bar><Widget /></Foo.Bar>`,
      filename: "src/View.tsx",
      mode: "source",
      typescript: true,
    })
    expect(out.entries).toEqual([])
  })
})

describe("annotationPlugin", () => {
  it("returns null in disabled mode", async () => {
    const plugin = annotationPlugin({ mode: "disabled", root: "/repo" })
    const result = await getTransform(plugin).call({}, sample, "/repo/src/App.tsx")

    expect(result).toBeNull()
  })

  it("emits transformed code and manifest snapshots in source mode", async () => {
    let manifest: SourceManifest | undefined
    const plugin = annotationPlugin({
      mode: "source",
      root: "/repo",
      onManifest: (next) => {
        manifest = next
      },
    })

    const result = await getTransform(plugin).call({}, sample, "/repo/src/App.tsx")

    expect(result).toMatchObject({
      code: expect.stringContaining(SOURCE_ATTR.id),
    })
    expect(Object.values(manifest ?? {})).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "src/App.tsx",
          component: "App",
          framework: "react",
        }),
      ]),
    )
  })
})
