import { describe, expect, it } from "vitest"
import { resolvePayloadSources } from "../src/index"
import { makeManifest, makeSafePayload, makeSourcePayload } from "./fixtures"

describe("resolvePayloadSources", () => {
  it("fills safe-mode sourceId from the manifest", () => {
    const payload = makeSafePayload()
    const resolved = resolvePayloadSources(payload, makeManifest())
    const source = resolved.annotations[0].target.source
    expect(source).toMatchObject({
      mode: "safe",
      sourceId: "s_19cu8m6",
      file: "src/App.tsx",
      line: 25,
      column: 9,
      component: "App",
      framework: "react",
    })
  })

  it("keeps source-mode payloads intact without a manifest entry", () => {
    const payload = makeSourcePayload()
    const resolved = resolvePayloadSources(payload, {})
    expect(resolved.annotations[0].target.source).toMatchObject({
      mode: "source",
      file: "src/App.tsx",
      line: 25,
      component: "App",
    })
  })

  it("does not mutate the original payload", () => {
    const payload = makeSafePayload()
    const snapshot = JSON.parse(JSON.stringify(payload))
    resolvePayloadSources(payload, makeManifest())
    expect(payload).toEqual(snapshot)
    // The original safe source still only carries the id.
    expect(payload.annotations[0].target.source).toEqual({
      mode: "safe",
      sourceId: "s_19cu8m6",
    })
  })

  it("passes through annotations whose sourceId is absent from the manifest", () => {
    const payload = makeSafePayload()
    const resolved = resolvePayloadSources(payload, {})
    expect(resolved.annotations[0].target.source).toEqual({
      mode: "safe",
      sourceId: "s_19cu8m6",
    })
  })
})
