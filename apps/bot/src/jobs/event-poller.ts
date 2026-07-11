import type { Telegraf } from "telegraf";
import { getPendingEvents, processEventSafely } from "../services/events.js";
import { logger } from "../utils/logger.js";

export class EventPoller {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;

  constructor(
    private readonly bot: Telegraf,
    private readonly intervalMs: number
  ) {}

  start(): void {
    if (this.timer) return;

    const tick = async () => {
      if (this.stopped || this.running) return;
      this.running = true;

      try {
        const events = await getPendingEvents();
        for (const event of events) {
          if (this.stopped) break;
          await processEventSafely(this.bot, event);
        }
      } catch (error) {
        logger.error({ error }, "Bot event polling tick failed");
      } finally {
        this.running = false;
      }
    };

    void tick();
    this.timer = setInterval(() => void tick(), this.intervalMs);
    this.timer.unref();
    logger.info({ intervalMs: this.intervalMs }, "Bot event poller started");
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
