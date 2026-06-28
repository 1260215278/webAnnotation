import type { SourceEntry, SourceManifest } from "./types"

export interface ManifestStore {
  merge: (entries: SourceEntry[]) => void
  toJSON: () => SourceManifest
  readonly size: number
}

/** In-memory accumulator mapping `sourceId` to its source location. */
export function createManifest(): ManifestStore {
  const map: SourceManifest = {}
  return {
    merge(entries) {
      for (const entry of entries) {
        map[entry.sourceId] = entry
      }
    },
    toJSON() {
      return { ...map }
    },
    get size() {
      return Object.keys(map).length
    },
  }
}
