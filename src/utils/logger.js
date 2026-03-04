'use strict';
const { createLogger, format, transports } = require('winston');
const config = require('../config');

const { combine, timestamp, colorize, printf, json, errors } = format;

// Human-readable format for development
const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, service, stack, ...meta }) => {
    const svc = service ? `[${service}] ` : '';
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    const stackStr = stack ? `\n${stack}` : '';
    return `${ts} ${level} ${svc}${message}${metaStr}${stackStr}`;
  })
);

// Structured JSON for production (easily ingested by log aggregators)
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

const logger = createLogger({
  level: config.env === 'production' ? 'info' : 'debug',
  format: config.env === 'production' ? prodFormat : devFormat,
  defaultMeta: { app: 'flash-exchange' },
  transports: [
    new transports.Console(),
  ],
});

// Child logger factory — adds a `service` field to every log line
logger.child = function (meta) {
  return createLogger({
    level: logger.level,
    format: config.env === 'production' ? prodFormat : devFormat,
    defaultMeta: { app: 'flash-exchange', ...meta },
    transports: [new transports.Console()],
  });
};

module.exports = logger;
