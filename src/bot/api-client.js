import { getBotConfig } from "./bot.config.js";

const { apiBaseUrl, appSecretKey } = getBotConfig();

async function postJson(path, body) {
  let response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-APP-KEY": appSecretKey,
      },
      body: JSON.stringify(body),
    });
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
