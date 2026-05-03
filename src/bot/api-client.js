import { getBotConfig } from "./bot.config.js";

const { apiBaseUrl, appSecretKey } = getBotConfig();
const WAKE_TIMEOUT_MS = 10_000;
const API_TIMEOUT_MS = 120_000;
const WAKE_RETRY_DELAYS_MS = [0, 3_000, 7_000, 15_000, 30_000];

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function wakeBackend() {
  let lastError = null;

  for (const delayMs of WAKE_RETRY_DELAYS_MS) {
    if (delayMs > 0) {
      await wait(delayMs);
    }

    try {
      const response = await fetchWithTimeout(
        `${apiBaseUrl}/health`,
        {
          method: "GET",
          headers: {
            "X-APP-KEY": appSecretKey,
          },
        },
        WAKE_TIMEOUT_MS,
      );

      if (response.ok) {
        return;
      }

      lastError = new Error(`Wake-up failed with status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`Backend pod ${apiBaseUrl} nie obudzil sie na czas. Sprobuj ponownie za chwile.`, {
    cause: lastError,
  });
}

async function postJson(path, body) {
  let response;

  await wakeBackend();

  try {
    response = await fetchWithTimeout(
      `${apiBaseUrl}${path}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-APP-KEY": appSecretKey,
        },
        body: JSON.stringify(body),
      },
      API_TIMEOUT_MS,
    );
  } catch (error) {
    throw new Error(`Nie moge polaczyc sie z backendem pod ${apiBaseUrl}`, {
      cause: error,
    });
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.success === false) {
    const message =
      payload?.error?.message || `API request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload?.data;
}

export function analyzeProduct({ productName, ingredients, userProfile }) {
  return postJson("/ai/analyze", {
    productName,
    ingredients,
    userProfile,
  });
}

export function askFollowUp({ userInput, context }) {
  return postJson("/ai/follow-up", {
    userInput,
    context,
  });
}
