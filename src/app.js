import Fastify from "fastify";
import cors from "@fastify/cors";
import { query } from "./db/db.js";
import { aiRoutes } from "./routes/ai.routes.js";
import { getSystemPrompt } from "./services/prompt.service.js";

export async function buildApp() {
  const app = Fastify({
    logger: true,
  });

  await app.register(cors, {
    origin: true,
  });

  app.addHook("onRequest", async (request, reply) => {
    const appKey = request.headers["x-app-key"];
    const expectedKey = process.env.APP_SECRET_KEY;

    if (!expectedKey) {
      throw new Error("APP_SECRET_KEY is not set in environment variables");
    }

    if (appKey !== expectedKey) {
      return reply.code(401).send({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid or missing X-APP-KEY",
        },
      });
    }
  });

  app.get("/health", async () => {
    return { status: "ok" };
  });

  app.get("/db-test", async (request, reply) => {
    try {
      const result = await query("SELECT NOW() AS current_time");
      const currentTime = result.rows[0]?.current_time;

      return reply.code(200).send({
        success: true,
        data: {
          currentTime,
        },
      });
    } catch (error) {
      request.log.error({ err: error }, "DB test route failed");

      return reply.code(500).send({
        success: false,
        error: {
          code: "DB_TEST_FAILED",
          message: "Failed to fetch database timestamp",
        },
      });
    }
  });

  app.get("/prompt-test", async (request, reply) => {
    try {
      const systemPrompt = await getSystemPrompt();
      return reply.code(200).send({ systemPrompt });
    } catch (error) {
      request.log.error({ err: error }, "Prompt test route failed");

      return reply.code(500).send({
        success: false,
        error: {
          code: "PROMPT_TEST_FAILED",
          message: "Failed to fetch system prompt",
        },
      });
    }
  });

  await app.register(aiRoutes, { prefix: "/ai" });

  app.setErrorHandler(async (error, request, reply) => {
    request.log.error({ err: error }, "Unhandled request error");

    if (!reply.sent) {
      await reply.code(500).send({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Internal Server Error",
        },
      });
    }
  });

  return app;
}
