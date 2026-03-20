import { Request, Response, NextFunction } from 'express'
import { LoggerService } from '../application/services/LoggerService'


export const errorMiddleware = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  res.status(500).json({
    status: 'error',
    timestamp: new Date().toISOString(),
    message: error.message,
  })

  LoggerService.logError('Application error', error, {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
  })

  next()
}
