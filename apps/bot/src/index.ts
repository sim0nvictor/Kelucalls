import http from "node:http";
import { Telegraf } from "telegraf";
import { env } from "./config/env.js";
import { registerCommands } from "./commands/index.js";
import { EventPoller } from "./jobs/event-poller.js";
import { handleHealth } from "./handlers/health.js";
import { logger } from "./utils/logger.js";

const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);
registerCommands(bot);

const poller = new EventPoller(bot, env.BOT_POLL_INTERVAL_MS);

async function startWebhook(): Promise<http.Server> {
  if (!env.TELEGRAM_WEBHOOK_URL) {
    throw new Error("TELEGRAM_WEBHOOK_URL is required for webhook mode");
  }

  const webhookPath = `/telegram/${env.TELEGRAM_WEBHOOK_SECRET}`;
  await bot.telegram.setWebhook(`${env.TELEGRAM_WEBHOOK_URL}${webhookPath}`, {
    secret_token: env.TELEGRAM_WEBHOOK_SECRET || undefined
  });

  return http.createServer(async (req, res) => {
    if (handleHealth(req, res)) return;

    if (req.method !== "POST" || req.url !== webhookPath) {
      res.writeHead(404);
      res.end();
      return;
    }

    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", async () => {
      try {
        const update = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        await bot.handleUpdate(update, res);
      } catch (error) {
        logger.error({ error }, "Webhook update failed");
        res.writeHead(500);
        res.end();
      }
    });
  });
}

async function startPolling(): Promise<void> {
  await bot.telegram.deleteWebhook();
  await bot.launch({ dropPendingUpdates: true });
}

async function main(): Promise<void> {
  const server = env.TELEGRAM_WEBHOOK_URL
    ? await startWebhook()
    : http.createServer((req, res) => {
      if (!handleHealth(req, res)) {
        res.writeHead(404);
        res.end();
      }
    });

  if (!env.TELEGRAM_WEBHOOK_URL) {
    await startPolling();
  }

  server.listen(env.PORT, () => {
    logger.info({ port: env.PORT, webhook: Boolean(env.TELEGRAM_WEBHOOK_URL) }, "Bot service listening");
  });

  poller.start();

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info({ signal }, "Bot service shutting down");
    poller.stop();
    bot.stop(signal);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 8000).unref();
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((error) => {
  logger.fatal({ error }, "Bot service failed to start");
  process.exit(1);
});
