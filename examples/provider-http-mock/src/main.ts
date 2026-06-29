import { createMockProviderServer } from "./provider"

const DEFAULT_PORT = 4400

function readPort(): number {
  const raw = process.env.PROVIDER_PORT
  if (!raw) return DEFAULT_PORT
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PORT
}

const port = readPort()
const server = createMockProviderServer()
server.listen(port, () => {
  const base = `http://localhost:${port}`
  console.log(`[provider-http-mock] patch provider listening on ${base}`)
  console.log(`[provider-http-mock] set WEB_ANNOTATION_PATCH_PROVIDER_URL=${base} on the platform`)
})
