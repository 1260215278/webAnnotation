import { describe, expect, it } from "vitest"
import { resolve } from "node:path"
import { collectRepoSourceContext } from "../src/index"
import type { PatchPromptAnnotation, PatchPromptContext } from "../src/index"

const ROOT = "/repo"

function ctx(annotations: PatchPromptAnnotation[]): PatchPromptContext {
  return {
    version: "v1",
    project: { projectId: "p" },
    page: { url: "u", route: "/", title: "t" },
    annotationGroup: { id: "g", mode: "single" },
    annotations,
  }
}

function anno(
  id: string,
  file: string | undefined,
  line?: number,
  extra: Partial<NonNullable<PatchPromptAnnotation["source"]>> = {},
): PatchPromptAnnotation {
  return {
    id,
    message: "change " + id,
    createdAt: "2026-06-28T00:00:00.000Z",
    target: { selector: "s", cssPath: "#c", tagName: "div", text: "x" },
    source: file === undefined ? undefined : { mode: "source", file, line, ...extra },
  }
}

/** Build injectable fs from a map of relative path -> content. */
function fsFrom(map: Record<string, string>) {
  const byAbs: Record<string, string> = {}
  for (const [rel, content] of Object.entries(map)) {
    byAbs[resolve(ROOT, rel)] = content
  }
  return {
    fileExists: (path: string) => path in byAbs,
    readFile: (path: string) => {
      if (!(path in byAbs)) throw new Error("missing " + path)
      return byAbs[path]
    },
  }
}

const fiftyLines = Array.from({ length: 50 }, (_, i) => "line" + (i + 1)).join("\n")

describe("collectRepoSourceContext", () => {
  it("reads a snippet around the annotated line", () => {
    const result = collectRepoSourceContext(ctx([anno("a", "src/App.tsx", 25, { component: "App" })]), {
      rootDir: ROOT,
      contextLines: 5,
      ...fsFrom({ "src/App.tsx": fiftyLines }),
    })
    expect(result.issues).toEqual([])
    expect(result.files).toHaveLength(1)
    const f = result.files[0]
    expect(f.file).toBe("src/App.tsx")
    expect(f.startLine).toBe(20)
    expect(f.endLine).toBe(30)
    expect(f.content).toContain("line25")
    expect(f.content).not.toContain("line19")
    expect(f.content).not.toContain("line31")
    expect(f.annotations).toEqual([
      { annotationId: "a", line: 25, column: undefined, component: "App", message: "change a" },
    ])
    // Prompt-facing path is relative, never absolute.
    expect(f.file).not.toContain(ROOT)
  })

  it("reads a file once but keeps every annotation that referenced it", () => {
    const result = collectRepoSourceContext(
      ctx([anno("a", "src/App.tsx", 10), anno("b", "src/App.tsx", 40)]),
      { rootDir: ROOT, contextLines: 2, ...fsFrom({ "src/App.tsx": fiftyLines }) },
    )
    expect(result.files).toHaveLength(1)
    expect(result.files[0].annotations.map((x) => x.annotationId)).toEqual(["a", "b"])
    // Range spans both annotated lines plus context.
    expect(result.files[0].startLine).toBe(8)
    expect(result.files[0].endLine).toBe(42)
  })

  it("rejects traversal, absolute, and out-of-root paths", () => {
    const result = collectRepoSourceContext(
      ctx([
        anno("a", "../secret.txt", 1),
        anno("b", "/etc/passwd", 1),
        anno("c", "src/../../escape.ts", 1),
        anno("d", "C:\\repo\\secret.ts", 1),
        anno("e", "\\\\server\\share\\secret.ts", 1),
      ]),
      { rootDir: ROOT, ...fsFrom({}) },
    )
    expect(result.files).toEqual([])
    const codes = result.issues.map((i) => i.code).sort()
    expect(codes).toEqual([
      "absolute_path",
      "absolute_path",
      "absolute_path",
      "path_escape",
      "path_escape",
    ])
  })

  it("rejects a relative rootDir", () => {
    const result = collectRepoSourceContext(ctx([anno("a", "src/App.tsx", 1)]), {
      rootDir: "repo",
      ...fsFrom({ "src/App.tsx": "content" }),
    })
    expect(result.files).toEqual([])
    expect(result.issues).toEqual([
      { code: "invalid_root", message: "rootDir must be an absolute path" },
    ])
  })

  it("reports missing, oversized, and binary files as issues", () => {
    const result = collectRepoSourceContext(
      ctx([
        anno("a", "src/missing.ts", 1),
        anno("b", "src/big.ts", 1),
        anno("c", "src/bin.ts", 1),
      ]),
      {
        rootDir: ROOT,
        maxBytesPerFile: 16,
        ...fsFrom({ "src/big.ts": "x".repeat(64), "src/bin.ts": "ok\u0000bin" }),
      },
    )
    expect(result.files).toEqual([])
    const byCode = Object.fromEntries(result.issues.map((i) => [i.file, i.code]))
    expect(byCode["src/missing.ts"]).toBe("not_found")
    expect(byCode["src/big.ts"]).toBe("too_large")
    expect(byCode["src/bin.ts"]).toBe("binary")
  })

  it("honors maxFiles and emits an issue for skipped files", () => {
    const result = collectRepoSourceContext(
      ctx([anno("a", "src/one.ts", 1), anno("b", "src/two.ts", 1)]),
      {
        rootDir: ROOT,
        maxFiles: 1,
        ...fsFrom({ "src/one.ts": "a\nb\nc", "src/two.ts": "d\ne\nf" }),
      },
    )
    expect(result.files.map((f) => f.file)).toEqual(["src/one.ts"])
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "max_files_exceeded", file: "src/two.ts" }),
    )
  })

  it("reads a head slice when no line is present and normalizes contextLines", () => {
    const result = collectRepoSourceContext(ctx([anno("a", "src/App.tsx", undefined)]), {
      rootDir: ROOT,
      contextLines: -3, // normalized to 0 -> at least one head line
      ...fsFrom({ "src/App.tsx": fiftyLines }),
    })
    expect(result.files).toHaveLength(1)
    expect(result.files[0].startLine).toBe(1)
    expect(result.files[0].endLine).toBe(1)
  })
})
