import 'dotenv/config'
import { createApp } from './server.js'

const PORT = Number(process.env.PORT ?? 4000)
const app  = createApp()

app.listen(PORT, () => {
  console.log(`\n  ▸ ShotHub API listening on http://localhost:${PORT}`)
  console.log(`  ▸ CORS origin(s): ${process.env.CORS_ORIGIN ?? 'http://localhost:5173'}`)
  console.log(`  ▸ Database:       ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@')}\n`)
})
