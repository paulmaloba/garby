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

  if (process.env.NODE_ENV !== 'production') {
    console.error(`[ERROR] ${status} — ${message}`, err.stack)
  }

  res.status(status).json({
    success: false,
    message,
    code,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  })
}
