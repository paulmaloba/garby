import 'dotenv/config'
import app from './app'

const PORT = parseInt(process.env.PORT ?? '3001', 10)

const server = app.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════╗
  ║       GARBY API — v0.1.0              ║
  ║  AI Content Authenticity Platform     ║
  ╠════════════════════════════════════════╣
  ║  Status  : Running                    ║
  ║  Port    : ${PORT}                         ║
  ║  Env     : ${(process.env.NODE_ENV ?? 'development').padEnd(10)}              ║
  ╚════════════════════════════════════════╝
  `)
})

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  console.log('SIGTERM received — shutting down gracefully...')
  server.close(() => {
    console.log('Server closed.')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('\nSIGINT received — shutting down...')
  server.close(() => process.exit(0))
})
