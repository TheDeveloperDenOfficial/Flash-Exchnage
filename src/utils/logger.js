'use strict';
const { createLogger, format, transports } = require('winston');
const config = require('../config');

const devFmt = format.combine(
  format.colorize(),
  format.timestamp({ format: 'HH:mm:ss' }),
  format.errors({ stack: true }),
  format.printf(({ level, message, timestamp: ts, service, stack, ...meta }) => {
    const s = service ? `[${service}] ` : '';
    const m = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${ts} ${level} ${s}${message}${m}${stack ? '\n' + stack : ''}`;
  })
);

const prodFmt = format.combine(format.timestamp(), format.errors({ stack: true }), format.json());

const base = createLogger({
  level: config.env === 'production' ? 'info' : 'debug',
  format: config.env === 'production' ? prodFmt : devFmt,
  transports: [new transports.Console()],
});

// Factory for service-scoped child loggers
function child(meta) {
  return createLogger({
    level: base.level,
    format: config.env === 'production' ? prodFmt : devFmt,
    defaultMeta: meta,
    transports: [new transports.Console()],
  });
}

base.child = child;
module.exports = base;
