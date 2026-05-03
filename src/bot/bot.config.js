import dotenv from "dotenv";

dotenv.config();

const DEFAULT_API_BASE_URL = "http://localhost:3000";

function requiredEnv(name) {
  const value = process.env[name];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function optionalEnv(name, fallback) {
  const value = process.env[name];

  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback;
  }

  return value.trim();
}

export function getBotConfig() {
  return {
    telegramBotToken: requiredEnv("TELEGRAM_BOT_TOKEN"),
    appSecretKey: requiredEnv("APP_SECRET_KEY"),
    apiBaseUrl: optionalEnv("API_BASE_URL", DEFAULT_API_BASE_URL).replace(/\/+$/, ""),
  };
}
