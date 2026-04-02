const LIMITS = {
  assessment: 300,
  summaryText: 400,
  recommendation: 400,
  mechanism: 500,
  verdict: 100,
  severity: 50,
  processingLevel: 50,
  prosItem: 100,
  consItem: 100,
  keyRisksItem: 120,
  alternativesItem: 120
};

function toSafeString(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  return String(value).trim();
}

// 🔥 SMART TRUNCATE (nie ucina w połowie słowa)
function smartTruncate(value, maxLength) {
  const safe = toSafeString(value);

  if (safe.length <= maxLength) return safe;

  const truncated = safe.slice(0, maxLength);

  const lastDot = truncated.lastIndexOf(".");
  const lastSpace = truncated.lastIndexOf(" ");

  // jeśli mamy pełne zdanie → utnij po kropce
  if (lastDot > maxLength * 0.6) {
    return truncated.slice(0, lastDot + 1);
  }

  // inaczej utnij na spacji + ...
  if (lastSpace > 0) {
    return truncated.slice(0, lastSpace) + "...";
  }

  return truncated + "...";
}

function sanitizeArray(value, maxItemLength) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => smartTruncate(item, maxItemLength))
    .filter((item) => item.length > 0);
}

export function sanitizeAIOutput(data) {
  const source = data && typeof data === "object" ? data : {};

  const userResponse =
    source.userResponse && typeof source.userResponse === "object"
      ? source.userResponse
      : {};

  const clinicalSummary =
    source.clinicalSummary && typeof source.clinicalSummary === "object"
      ? source.clinicalSummary
      : {};

  return {
    userResponse: {
      assessment: smartTruncate(userResponse.assessment, LIMITS.assessment),
      pros: sanitizeArray(userResponse.pros, LIMITS.prosItem),
      cons: sanitizeArray(userResponse.cons, LIMITS.consItem),
      keyRisks: sanitizeArray(userResponse.keyRisks, LIMITS.keyRisksItem),
      mechanism: smartTruncate(userResponse.mechanism, LIMITS.mechanism),
      recommendation: smartTruncate(userResponse.recommendation, LIMITS.recommendation),
      alternatives: sanitizeArray(userResponse.alternatives, LIMITS.alternativesItem)
    },
    clinicalSummary: {
      verdict: smartTruncate(clinicalSummary.verdict, LIMITS.verdict),
      severity: smartTruncate(clinicalSummary.severity, LIMITS.severity),
      summaryText: smartTruncate(clinicalSummary.summaryText, LIMITS.summaryText),
      score: Number.isFinite(clinicalSummary.score) ? clinicalSummary.score : 0,
      processingLevel: smartTruncate(
        clinicalSummary.processingLevel,
        LIMITS.processingLevel
      ),
      allergensDetected: sanitizeArray(
        clinicalSummary.allergensDetected,
        LIMITS.keyRisksItem
      )
    }
  };
}