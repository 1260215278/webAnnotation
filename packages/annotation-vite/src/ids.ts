/** djb2 string hash, returned as an unsigned 32-bit integer. */
function djb2(input: string): number {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0
  }
  return hash >>> 0
}

/**
 * Deterministic, anonymous source id. Stable across builds for the same
 * location, and (in safe mode) reveals nothing about the underlying path.
 */
export function makeSourceId(file: string, line: number, column: number): string {
  const hash = djb2(`${file}:${line}:${column}`)
  return `s_${hash.toString(36)}`
}
