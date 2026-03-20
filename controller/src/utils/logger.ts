import { formatInTimeZone } from 'date-fns-tz'
import winston from 'winston'

let loggerInstance: winston.Logger | null = null

const getFormattedDate = (date: Date): string => {
  return formatInTimeZone(date, 'UTC', "dd/MM/y HH':'mm':'ss'.'SSS 'UTC'")
}

const getFormat = (): winston.Logform.Format => {
  const customFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
    if (metadata.query && typeof metadata.query == 'string') {
      metadata.query = metadata.query.replace(/\s+/g, ' ').trim()
    }

    let log = `${timestamp} [${level.toUpperCase()}] ${message}`

    if (metadata.query) {
      log += `\n  Query: ${metadata.query}`
      if (metadata.parameters && Array.isArray(metadata.parameters) && metadata.parameters.length > 0) {
        log += `\n  Parameters: ${JSON.stringify(metadata.parameters)}`
      }
      if (metadata.duration) {
        log += `\n  Duration: ${metadata.duration}`
      }
      if (metadata.rowCount !== undefined) {
        log += `\n  Rows affected: ${metadata.rowCount}`
      }
    }

    if (metadata.error) {
      log += `\n  Error: ${metadata.error}`
      if (metadata.stack) {
        log += `\n  Stack: ${metadata.stack}`
      }
    }

    log += `\n`

    if (Object.keys(metadata).length > 0) {
      log += `${JSON.stringify(metadata, null, 2)}\n`
    }

    return log
  })

  return customFormat
}

export const getLogger = () => {
  if (loggerInstance) {
    return loggerInstance
  }

  const transports: winston.transport[] = [new winston.transports.Console()]

  if (process.env.ENABLE_FILE_LOGGING?.toLowerCase() === 'true') {
    transports.push(new winston.transports.File({ filename: 'logs/app.log' }))
  }

  loggerInstance = winston.createLogger({
    level: 'debug',
    format: winston.format.combine(
      winston.format.timestamp({ format: () => getFormattedDate(new Date()) }),
      getFormat()
    ),
    transports
  })

  return loggerInstance
}