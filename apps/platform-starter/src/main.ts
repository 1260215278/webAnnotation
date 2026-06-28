import { createPlatformServer } from "./index"

const port = Number(process.env.PORT ?? 4319)
const { server } = createPlatformServer()

server.listen(port, () => {
  console.log(`[platform-starter] ingest API listening on http://localhost:${port}`)
})
