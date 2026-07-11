import pino from "pino";

export const logger = pino({
  name: "kelucalls-telegram-bot",
  level: process.env.LOG_LEVEL ?? "info",
  timestamp: pino.stdTimeFunctions.isoTime
});

