import { createPlatformServer } from "./index"

const port = Number(process.env.PORT ?? 4319)
const { server } = createPlatformServer()

server.listen(port, () => {
  const base = `http://localhost:${port}`
  console.log(`[platform-starter] ingest API listening on ${base}`)
  console.log(`[platform-starter] task console at ${base}/console`)
})
