import OpenAI from "openai";
import { query } from "../db/db.js";
import { getSystemPrompt } from "./prompt.service.js";

const MODEL = "gpt-5.4-mini";
const TEMPERATURE = 0.2;
const MAX_OUTPUT_TOKENS = 3000;
const OPENAI_TIMEOUT_MS = 10000;

/*
JSON schema guards
These instructions force the model to respond with strict JSON.
*/

const OUTPUT_SCHEMA_INSTRUCTION = [
  "Respond in JSON only.",
  "Return exactly this object shape:",
  "{",
  '  "userResponse": {',
  '    "assessment": "string",',
  '    "pros": ["string"],',
  '    "cons": ["string"],',
  '    "keyRisks": ["string"],',
  '    "mechanism": "string",',
  '    "recommendation": "string",',
  '    "alternatives": ["string"]',
  "  },",
  '  "clinicalSummary": {',
  '    "verdict": "string",',
  '    "severity": "string",',
  '    "summaryText": "string",',
  '    "score": "number",',
  '    "processingLevel": "string",',
  '    "allergensDetected": ["string"]',
  "  }",
  "}",
  "Do not add extra keys.",
].join("\n");

const FOLLOW_UP_OUTPUT_SCHEMA_INSTRUCTION = [
  "Respond in JSON only.",
  "Return exactly this object shape:",
  "{",
  '  "answer": "string"',
  "}",
  "Do not add extra keys.",
].join("\n");

const JSON_OBJECT_FORMAT = { type: "json_object" };

let openaiClient = null;

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function getOpenAIClient() {
  if (openaiClient) {
    return openaiClient;
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!isNonEmptyString(apiKey)) {
    throw new Error("Missing required environment variable: OPENAI_API_KEY");
  }

  openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

/*
Build user input for the analyze endpoint
*/

function buildAnalyzeUserInput(payload) {
  if (!isObject(payload)) {
    throw new Error("Invalid analyze payload: expected an object");
  }

  if (isNonEmptyString(payload.userInput)) {
    return payload.userInput.trim();
  }

  if (isNonEmptyString(payload.productName) && isNonEmptyString(payload.ingredients)) {
    const parts = [
      `Product name: ${payload.productName.trim()}`,
      `Ingredients: ${payload.ingredients.trim()}`
    ];

    if (payload.userProfile !== undefined) {
      if (!isObject(payload.userProfile)) {
        throw new Error("Invalid analyze payload: userProfile must be an object");
      }

      parts.push(`User profile: ${JSON.stringify(payload.userProfile)}`);
    }

    return parts.join("\n");
  }

  throw new Error("Invalid analyze payload: missing userInput or productName/ingredients");
}

/*
Response validation for analysis
*/

function normalizeAiResponse(parsed) {
  if (!isObject(parsed)) {
    throw new Error("AI response must be a JSON object");
  }

  const { userResponse, clinicalSummary } = parsed;

  if (!isObject(userResponse)) {
    throw new Error("AI response is missing userResponse object");
  }

  if (
    !Array.isArray(userResponse.keyRisks) ||
    userResponse.keyRisks.some((value) => typeof value !== "string")
  ) {
    throw new Error("AI response has invalid userResponse.keyRisks");
  }

  if (
    !Array.isArray(userResponse.pros) ||
    userResponse.pros.some((value) => typeof value !== "string")
  ) {
    throw new Error("AI response has invalid userResponse.pros");
  }

  if (
    !Array.isArray(userResponse.cons) ||
    userResponse.cons.some((value) => typeof value !== "string")
  ) {
    throw new Error("AI response has invalid userResponse.cons");
  }

  if (!isNonEmptyString(userResponse.assessment)) {
    throw new Error("AI response has invalid userResponse.assessment");
  }

  if (!isNonEmptyString(userResponse.mechanism)) {
    throw new Error("AI response has invalid userResponse.mechanism");
  }

  if (!isNonEmptyString(userResponse.recommendation)) {
    throw new Error("AI response has invalid userResponse.recommendation");
  }

  if (
    userResponse.alternatives !== undefined &&
    (!Array.isArray(userResponse.alternatives) ||
      userResponse.alternatives.some((value) => typeof value !== "string"))
  ) {
    throw new Error("AI response has invalid userResponse.alternatives");
  }

  if (!isObject(clinicalSummary)) {
    throw new Error("AI response is missing clinicalSummary object");
  }

  if (!isNonEmptyString(clinicalSummary.verdict)) {
    throw new Error("AI response has invalid clinicalSummary.verdict");
  }

  if (!isNonEmptyString(clinicalSummary.severity)) {
    throw new Error("AI response has invalid clinicalSummary.severity");
  }

  if (!isNonEmptyString(clinicalSummary.summaryText)) {
    throw new Error("AI response has invalid clinicalSummary.summaryText");
  }

  if (clinicalSummary.score !== undefined && typeof clinicalSummary.score !== "number") {
    throw new Error("AI response has invalid clinicalSummary.score");
  }

  if (
    clinicalSummary.processingLevel !== undefined &&
    typeof clinicalSummary.processingLevel !== "string"
  ) {
    throw new Error("AI response has invalid clinicalSummary.processingLevel");
  }

  if (
    clinicalSummary.allergensDetected !== undefined &&
    (!Array.isArray(clinicalSummary.allergensDetected) ||
      clinicalSummary.allergensDetected.some((value) => typeof value !== "string"))
  ) {
    throw new Error("AI response has invalid clinicalSummary.allergensDetected");
  }

  return {
    userResponse: {
      assessment: userResponse.assessment.trim(),
      pros: userResponse.pros.map((value) => value.trim()),
      cons: userResponse.cons.map((value) => value.trim()),
      keyRisks: userResponse.keyRisks.map((r) => r.trim()),
      mechanism: userResponse.mechanism.trim(),
      recommendation: userResponse.recommendation.trim(),
      alternatives: (userResponse.alternatives ?? []).map((value) => value.trim())
    },
    clinicalSummary: {
      verdict: clinicalSummary.verdict.trim(),
      severity: clinicalSummary.severity.trim(),
      summaryText: clinicalSummary.summaryText.trim(),
      score: clinicalSummary.score ?? null,
      processingLevel: clinicalSummary.processingLevel ?? null,
      allergensDetected: clinicalSummary.allergensDetected ?? []
    }
  };
}

/*
Follow-up validation
*/

function normalizeFollowUpResponse(parsed) {
  if (!isObject(parsed)) {
    throw new Error("Follow-up AI response must be a JSON object");
  }

  if (!isNonEmptyString(parsed.answer)) {
    throw new Error("Follow-up AI response has invalid answer");
  }

  return {
    answer: parsed.answer.trim()
  };
}

/*
OpenAI request with timeout protection
*/

async function createCompletionWithTimeout(client, params) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, OPENAI_TIMEOUT_MS);

  try {
    return await client.responses.create(params, {
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("OpenAI request timed out");
    }
    const status = error?.status ?? error?.response?.status ?? "unknown";
    const code = error?.code ?? "unknown";
    const message = error?.message ?? "Unknown OpenAI error";
    console.error("OpenAI API request failed", { status, code, message });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function extractResponseText(response) {
  if (isNonEmptyString(response?.output_text)) {
    return response.output_text.trim();
  }

  const output = Array.isArray(response?.output) ? response.output : [];

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (isNonEmptyString(part?.text)) {
        return part.text.trim();
      }
    }
  }

  return "";
}

/*
Analyze request
*/

async function requestAiJson(messages) {
  const client = getOpenAIClient();
  const systemMessage = Array.isArray(messages)
    ? messages.find((message) => message?.role === "system" && isNonEmptyString(message?.content))
    : null;
  const userMessage = Array.isArray(messages)
    ? messages.find((message) => message?.role === "user" && isNonEmptyString(message?.content))
    : null;

  if (!systemMessage || !userMessage) {
    throw new Error("Invalid messages payload: expected system and user messages");
  }

  let response;

  try {
    response = await createCompletionWithTimeout(client, {
      model: MODEL,
      temperature: TEMPERATURE,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      text: {
        format: JSON_OBJECT_FORMAT
      },
      input: [
        {
          role: "system",
          content: `${OUTPUT_SCHEMA_INSTRUCTION}\n\n${systemMessage.content}`
        },
        { role: "user", content: userMessage.content }
      ]
    });
  } catch (error) {
    const status = error?.status ?? error?.response?.status ?? "unknown";
    const code = error?.code ?? "unknown";
    const message = error?.message ?? "Unknown OpenAI error";
    console.error("OpenAI analyze request failed", { status, code, message });
    throw error;
  }

  const content = extractResponseText(response);

  if (!isNonEmptyString(content)) {
    throw new Error("OpenAI returned an empty response");
  }

  let parsed;

  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error("Failed to parse OpenAI JSON response", { cause: error });
  }

  return normalizeAiResponse(parsed);
}

/*
Follow-up request
*/

async function requestFollowUpJson(messages) {
  const client = getOpenAIClient();
  const userMessage = Array.isArray(messages)
    ? messages.find((message) => message?.role === "user" && isNonEmptyString(message?.content))
    : null;

  if (!userMessage) {
    throw new Error("Invalid follow-up messages payload: expected user message");
  }

  let response;

  try {
    response = await createCompletionWithTimeout(client, {
      model: MODEL,
      temperature: TEMPERATURE,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      text: {
        format: JSON_OBJECT_FORMAT
      },
      input: [
        { role: "system", content: FOLLOW_UP_OUTPUT_SCHEMA_INSTRUCTION },
        { role: "user", content: userMessage.content }
      ]
    });
  } catch (error) {
    const status = error?.status ?? error?.response?.status ?? "unknown";
    const code = error?.code ?? "unknown";
    const message = error?.message ?? "Unknown OpenAI error";
    console.error("OpenAI follow-up request failed", { status, code, message });
    throw error;
  }

  const content = extractResponseText(response);

  if (!isNonEmptyString(content)) {
    throw new Error("OpenAI returned an empty follow-up response");
  }

  let parsed;

  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error("Failed to parse OpenAI follow-up JSON response", { cause: error });
  }

  return normalizeFollowUpResponse(parsed);
}

/*
Persist short session summary
*/

async function saveSessionSummary(clinicalSummary, productName) {
  await query(
    `
      INSERT INTO session_summary (
        session_id,
        product_name,
        verdict,
        severity,
        summary_text
      )
      VALUES ($1,$2,$3,$4,$5)
    `,
    [
      null,
      productName ?? null,
      clinicalSummary.verdict,
      clinicalSummary.severity,
      clinicalSummary.summaryText
    ]
  );
}

/*
Main analyze endpoint
*/

export async function analyzeInput(payload) {
  const systemPrompt = await getSystemPrompt();
  const userInput = buildAnalyzeUserInput(payload);

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userInput }
  ];

  const result = await requestAiJson(messages);

  await saveSessionSummary(result.clinicalSummary, payload.productName);

  return result;
}

/*
Follow-up conversation
*/

export async function analyzeFollowUp(payload) {
  if (!isObject(payload)) {
    throw new Error("Invalid follow-up payload");
  }

  if (!isNonEmptyString(payload.userInput)) {
    throw new Error("Invalid follow-up payload: userInput must be string");
  }

  if (!isObject(payload.context)) {
    throw new Error("Invalid follow-up payload: context missing");
  }

  const context = payload.context;

  const productName = isNonEmptyString(context.productName) ? context.productName.trim() : "Unknown product";
  const ingredients = isNonEmptyString(context.ingredients) ? context.ingredients.trim() : "Unknown ingredients";
  const summary = isNonEmptyString(context.summary) ? context.summary.trim() : "N/A";
  const verdict = isNonEmptyString(context.verdict) ? context.verdict.trim() : "N/A";

  const keyRisks = Array.isArray(context.keyRisks)
    ? context.keyRisks.join(", ")
    : "N/A";

  const followUpPrompt = [
    "You are a clinical nutrition expert.",
    "",
    `Product: ${productName}`,
    `Ingredients: ${ingredients}`,
    "",
    "Previous analysis summary:",
    summary,
    "",
    `Verdict: ${verdict}`,
    `Key risks: ${keyRisks}`,
    "",
    "User question:",
    payload.userInput.trim(),
    "",
    "Answer professionally as an experienced dietitian.",
    "Do not repeat the full analysis unless necessary.",
    "Keep the answer clear and practical.",
    "",
    "Return JSON:",
    "{",
    '"answer": "..."',
    "}"
  ].join("\n");

  const messages = [
    { role: "user", content: followUpPrompt }
  ];

  return requestFollowUpJson(messages);
}
