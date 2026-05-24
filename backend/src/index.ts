import 'dotenv/config'
// Sentry MUST init before any other import that might throw, so its error
// hooks are installed when our code first runs. No-op when SENTRY_DSN is empty.
import { initSentry } from './lib/sentry.js'
initSentry()
import { createApp } from './server.js'

const PORT = Number(process.env.PORT ?? 4000)
const app  = createApp()

app.listen(PORT, () => {
  console.log(`\n  ▸ ShotHub API listening on http://localhost:${PORT}`)
  console.log(`  ▸ CORS origin(s): ${process.env.CORS_ORIGIN ?? 'http://localhost:5173'}`)
  console.log(`  ▸ Database:       ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@')}\n`)
})
