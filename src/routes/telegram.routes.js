import {
  BOT_VERSION,
  getTelegramWebhookSecret,
  getTelegramWebhookUrl,
  telegramBot,
} from "../bot/telegram.bot.js";

const RECENT_UPDATE_TTL_MS = 10 * 60 * 1000;
const recentUpdateIds = new Map();

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function rememberUpdate(updateId) {
  const now = Date.now();

  for (const [storedUpdateId, expiresAt] of recentUpdateIds) {
    if (expiresAt <= now) {
      recentUpdateIds.delete(storedUpdateId);
    }
  }

  if (recentUpdateIds.has(updateId)) {
    return false;
  }

  recentUpdateIds.set(updateId, now + RECENT_UPDATE_TTL_MS);
  return true;
}

export async function telegramRoutes(app) {
  app.get("/status", async () => {
    const webhookSecret = getTelegramWebhookSecret();
    const webhookUrl = getTelegramWebhookUrl();

    return {
      ok: true,
      botVersion: BOT_VERSION,
      webhookUrlConfigured: webhookUrl.length > 0,
      webhookUrl,
      webhookSecretConfigured: webhookSecret.length > 0,
    };
  });

  app.post("/webhook", async (request, reply) => {
    const expectedSecret = getTelegramWebhookSecret();

    if (expectedSecret) {
      const actualSecret = request.headers["x-telegram-bot-api-secret-token"];

      if (actualSecret !== expectedSecret) {
        request.log.warn(
          {
            hasActualSecret: typeof actualSecret === "string" && actualSecret.length > 0,
          },
          "Rejected Telegram webhook request because secret token did not match",
        );

        return reply.code(401).send({
          ok: false,
          error: "Invalid Telegram webhook secret",
        });
      }
    }

    if (!isObject(request.body)) {
      return reply.code(400).send({
        ok: false,
        error: "Telegram update body must be an object",
      });
    }

    if (Number.isInteger(request.body.update_id) && !rememberUpdate(request.body.update_id)) {
      return reply.code(200).send({ ok: true, duplicate: true });
    }

    reply.code(200).send({ ok: true });

    setImmediate(() => {
      telegramBot.handleUpdate(request.body).catch((error) => {
        request.log.error({ err: error }, "Telegram webhook update failed");
      });
    });
  });
}
