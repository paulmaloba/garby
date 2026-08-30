import { Request, Response, NextFunction } from 'express'

interface AppError extends Error {
  status?: number
  code?: string
}

/**
 * errorHandler — Centralised Express error handler.
 * Catches all errors thrown or passed via next(error) in any route or middleware.
 */
export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const status  = err.status  ?? 500
  const message = err.message ?? 'Internal server error'
  const code    = err.code    ?? 'INTERNAL_ERROR'

  // Always log server-side — production is exactly when you need this in
  // the platform's log viewer (Render, etc.). Only the CLIENT-facing
  // response below hides the stack trace in production.
  console.error(`[ERROR] ${status} — ${message}`, err.stack)

  res.status(status).json({
    success: false,
    message,
    code,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  })
}
