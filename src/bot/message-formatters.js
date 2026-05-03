function listOrDash(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return "-";
  }

  return items.map((item) => `- ${item}`).join("\n");
}

export function formatAnalysis({ productName, ingredients, analysis }) {
  const userResponse = analysis.userResponse;
  const clinicalSummary = analysis.clinicalSummary;

  return [
    `Produkt: ${productName}`,
    "",
    "Ocena:",
    userResponse.assessment,
    "",
    `Werdykt: ${clinicalSummary.verdict}`,
    `Poziom ryzyka: ${clinicalSummary.severity}`,
    `Wynik: ${clinicalSummary.score}/100`,
    "",
    "Plusy:",
    listOrDash(userResponse.pros),
    "",
    "Minusy:",
    listOrDash(userResponse.cons),
    "",
    "Kluczowe ryzyka:",
    listOrDash(userResponse.keyRisks),
    "",
    "Rekomendacja:",
    userResponse.recommendation,
    "",
    "Sklad:",
    ingredients,
  ].join("\n");
}

export function formatTopicIntro({ productName, ingredients, analysis }) {
  return [
    "To jest osobny topic tej analizy. Pytaj tutaj o ten konkretny produkt.",
    "",
    formatAnalysis({ productName, ingredients, analysis }),
  ].join("\n");
}

export function buildFollowUpContext({ productName, ingredients, analysis }) {
  return {
    productName,
    ingredients,
    summary: analysis.clinicalSummary.summaryText,
    verdict: analysis.clinicalSummary.verdict,
    keyRisks: analysis.userResponse.keyRisks,
  };
}

export function formatFollowUpAnswer(answer) {
  return `Odpowiedz:\n${answer}`;
}

export function safeTopicName(productName) {
  const normalized = productName.replace(/\s+/g, " ").trim();
  const suffix = new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date());
  const maxProductLength = 128 - suffix.length - 3;
  const shortName = normalized.slice(0, Math.max(1, maxProductLength)).trim();

  return `${shortName} - ${suffix}`;
}
