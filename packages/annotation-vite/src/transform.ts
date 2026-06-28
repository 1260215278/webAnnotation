import * as babel from "@babel/core"
import type { NodePath, PluginObj } from "@babel/core"
import * as t from "@babel/types"
import { SOURCE_ATTR } from "@web-annotation/core"
import { makeSourceId } from "./ids"
import type { SourceEntry, TransformInput, TransformOutput } from "./types"

/** Intrinsic host elements are lowercase JSX identifiers (`div`, `button`, custom-elements). */
function isIntrinsicTag(tag: string): boolean {
  return /^[a-z]/.test(tag)
}

function hasAttribute(node: t.JSXOpeningElement, name: string): boolean {
  return node.attributes.some(
    (attr) =>
      t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === name,
  )
}

function attribute(name: string, value: string): t.JSXAttribute {
  return t.jsxAttribute(t.jsxIdentifier(name), t.stringLiteral(value))
}

/** Nearest enclosing component name (function declaration or `const X = () => ...`). */
function getComponentName(path: NodePath<t.JSXOpeningElement>): string | undefined {
  const fnParent = path.getFunctionParent()
  if (!fnParent) return undefined

  const node = fnParent.node
  if (t.isFunctionDeclaration(node) && node.id) {
    return node.id.name
  }
  if (t.isFunctionExpression(node) && node.id) {
    return node.id.name
  }
  if (t.isFunctionExpression(node) || t.isArrowFunctionExpression(node)) {
    const parent = fnParent.parentPath?.node
    if (parent && t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
      return parent.id.name
    }
  }
  return undefined
}

function buildAttributes(mode: "source" | "safe", entry: SourceEntry): t.JSXAttribute[] {
  const attrs = [
    attribute(SOURCE_ATTR.id, entry.sourceId),
    attribute(SOURCE_ATTR.mode, mode),
  ]
  if (mode === "source") {
    attrs.push(
      attribute(SOURCE_ATTR.file, entry.file),
      attribute(SOURCE_ATTR.line, String(entry.line)),
      attribute(SOURCE_ATTR.column, String(entry.column)),
      attribute(SOURCE_ATTR.framework, entry.framework),
    )
    if (entry.component) {
      attrs.push(attribute(SOURCE_ATTR.component, entry.component))
    }
  }
  return attrs
}

/**
 * Inject source-metadata attributes onto every intrinsic HTML element in a React
 * JSX/TSX module. Components, member expressions (`Foo.Bar`), namespaced names and
 * Fragments are skipped. Pure and Vite-independent so it can be unit tested directly.
 */
export function transformReactSource(input: TransformInput): TransformOutput {
  const entries: SourceEntry[] = []
  const framework = input.framework ?? "react"

  const injectPlugin = (): PluginObj => ({
    name: "web-annotation-source-inject",
    visitor: {
      JSXOpeningElement(path) {
        const nameNode = path.node.name
        // Only intrinsic identifiers — skips <Foo.Bar/>, <ns:x/> and components.
        if (!t.isJSXIdentifier(nameNode)) return
        if (!isIntrinsicTag(nameNode.name)) return

        const loc = path.node.loc
        if (!loc) return
        if (hasAttribute(path.node, SOURCE_ATTR.id)) return

        const line = loc.start.line
        const column = loc.start.column + 1
        const component = getComponentName(path)
        const entry: SourceEntry = {
          sourceId: makeSourceId(input.filename, line, column),
          file: input.filename,
          line,
          column,
          framework,
          tag: nameNode.name,
        }
        if (component) entry.component = component
        entries.push(entry)

        path.node.attributes.push(...buildAttributes(input.mode, entry))
      },
    },
  })

  const result = babel.transformSync(input.code, {
    filename: input.filename,
    babelrc: false,
    configFile: false,
    ast: false,
    code: true,
    sourceMaps: true,
    sourceType: "module",
    parserOpts: {
      plugins: input.typescript ? ["jsx", "typescript"] : ["jsx"],
    },
    plugins: [injectPlugin],
  })

  if (!result || result.code == null) {
    return { code: input.code, map: null, entries: [] }
  }

  // Babel's source map is a JSON RawSourceMap, structurally compatible with
  // Rollup/Vite's SourceMapInput. Cast once at this interop boundary.
  const map = (result.map ?? null) as TransformOutput["map"]
  return { code: result.code, map, entries }
}
