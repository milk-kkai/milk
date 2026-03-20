import {
  analyzeController,
  followUpController,
} from "../controllers/ai.controller.js";
import { getSystemPrompt } from "../services/prompt.service.js";
import 'dotenv/config'

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export async function aiRoutes(app) {

  app.post("/analyze", analyzeController);
  app.post("/follow-up", followUpController);

  app.get("/env-check", async (_request, reply) => {
    return reply.code(200).send({
      success: true,
      env: {
        openaiApiKeyPresent: isNonEmptyString(process.env.OPENAI_API_KEY),
        databaseUrlPresent: isNonEmptyString(process.env.DATABASE_URL),
      },
    });
  });

  app.get("/prompt-test", async (request, reply) => {
    try {
      const systemPrompt = await getSystemPrompt();

      return reply.code(200).send({
        success: true,
        systemPrompt,
      });
    } catch (error) {
      request.log.error({ err: error }, "AI prompt-test route failed");

      return reply.code(500).send({
        success: false,
        error: {
          code: "PROMPT_TEST_FAILED",
          message: "Failed to fetch system prompt",
        },
      });
    }
  });
}
