import { analyzeFollowUp, analyzeInput } from "../services/ai.service.js";

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validationError(reply, message) {
  return reply.code(400).send({
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message,
    },
  });
}

function internalError(request, reply, error, message) {
  request.log.error(
    {
      err: error,
      errorChain: buildErrorChain(error),
    },
    message,
  );

  return reply.code(500).send({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "AI request failed",
    },
  });
}

function buildErrorChain(error) {
  if (!error || typeof error !== "object") {
    return null;
  }

  const details = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };

  if ("status" in error) {
    details.status = error.status;
  }

  if ("code" in error) {
    details.code = error.code;
  }

  if ("type" in error) {
    details.type = error.type;
  }

  if ("param" in error) {
    details.param = error.param;
  }

  if ("request_id" in error) {
    details.requestId = error.request_id;
  }

  if ("cause" in error && error.cause) {
    details.cause = buildErrorChain(error.cause);
  }

  return details;
}

function validateAnalyzeBody(body) {
  if (!isObject(body)) {
    return "Request body must be a JSON object";
  }

  if (!isNonEmptyString(body.productName)) {
    return "Field 'productName' is required and must be a non-empty string";
  }

  if (!isNonEmptyString(body.ingredients)) {
    return "Field 'ingredients' is required and must be a non-empty string";
  }

  if (body.userProfile !== undefined && !isObject(body.userProfile)) {
    return "Field 'userProfile' must be an object if provided";
  }

  return null;
}

function validateFollowUpBody(body) {
  if (!isObject(body)) {
    return "Request body must be a JSON object";
  }

  if (!isNonEmptyString(body.userInput)) {
    return "Field 'userInput' is required and must be a non-empty string";
  }

  if (!isObject(body.context)) {
    return "Field 'context' is required and must be an object";
  }

  return null;
}

export async function analyzeController(request, reply) {
  const validationMessage = validateAnalyzeBody(request.body);

  if (validationMessage) {
    return validationError(reply, validationMessage);
  }

  const { productName, ingredients, userProfile } = request.body;

  try {
    const result = await analyzeInput({
      productName,
      ingredients,
      userProfile,
    });

    return reply.code(200).send({
      success: true,
      data: result,
    });
  } catch (error) {
    return internalError(request, reply, error, "AI analyze failed");
  }
}

export async function followUpController(request, reply) {
  const validationMessage = validateFollowUpBody(request.body);

  if (validationMessage) {
    return validationError(reply, validationMessage);
  }

  const { userInput, context } = request.body;

  try {
    const result = await analyzeFollowUp({
      userInput,
      context,
    });

    return reply.code(200).send({
      success: true,
      data: result,
    });
  } catch (error) {
    return internalError(request, reply, error, "AI follow-up failed");
  }
}
