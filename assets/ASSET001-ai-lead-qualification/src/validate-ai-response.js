const SERVICE_CATEGORIES = new Set([
  'api_integration',
  'crm_automation',
  'ai_workflow',
  'data_integration',
  'other',
  'unknown',
]);
const URGENCY_VALUES = new Set(['low', 'medium', 'high', 'unknown']);
const PURCHASE_INTENT_VALUES = new Set([
  'weak',
  'moderate',
  'strong',
  'unknown',
]);
const RECOMMENDED_ACTION_VALUES = new Set([
  'sales_follow_up',
  'human_review',
  'nurture',
]);
const MISSING_INFORMATION_VALUES = new Set([
  'service_requested',
  'enquiry_message',
  'budget_band',
  'timeline_band',
  'company_description',
]);
const REQUIRED_PROPERTIES = [
  'service_category',
  'problem_summary',
  'urgency',
  'purchase_intent',
  'estimated_fit_score',
  'confidence',
  'missing_information',
  'qualification_reason',
  'recommended_action',
  'response_draft',
];

function extractContent(itemJson) {
  const content = itemJson?.content;
  if (typeof content === 'string') return content;
  if (content && typeof content === 'object') return content;
  if (itemJson && REQUIRED_PROPERTIES.every(
    (property) => Object.hasOwn(itemJson, property),
  )) {
    return itemJson;
  }
  return null;
}

function parseContent(content) {
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    return content;
  }
  if (typeof content !== 'string') return null;

  const trimmed = content.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(withoutFence);
  } catch {
    return null;
  }
}

function validateText(errors, value, field, maximumLength) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximumLength) {
    errors.push(`${field} must be a non-empty string no longer than ${maximumLength} characters`);
  }
}

function validateResponse(response) {
  const errors = [];
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    return ['response must be a JSON object'];
  }

  const keys = Object.keys(response);
  for (const property of REQUIRED_PROPERTIES) {
    if (!Object.hasOwn(response, property)) errors.push(`${property} is required`);
  }
  for (const property of keys) {
    if (!REQUIRED_PROPERTIES.includes(property)) {
      errors.push(`${property} is not an allowed property`);
    }
  }

  if (!SERVICE_CATEGORIES.has(response.service_category)) {
    errors.push('service_category is not an allowed value');
  }
  validateText(errors, response.problem_summary, 'problem_summary', 500);
  if (!URGENCY_VALUES.has(response.urgency)) {
    errors.push('urgency is not an allowed value');
  }
  if (!PURCHASE_INTENT_VALUES.has(response.purchase_intent)) {
    errors.push('purchase_intent is not an allowed value');
  }
  if (
    !Number.isInteger(response.estimated_fit_score) ||
    response.estimated_fit_score < 0 ||
    response.estimated_fit_score > 100
  ) {
    errors.push('estimated_fit_score must be an integer from 0 through 100');
  }
  if (
    typeof response.confidence !== 'number' ||
    !Number.isFinite(response.confidence) ||
    response.confidence < 0 ||
    response.confidence > 1
  ) {
    errors.push('confidence must be a number from 0 through 1');
  }
  if (!Array.isArray(response.missing_information)) {
    errors.push('missing_information must be an array');
  } else {
    if (response.missing_information.length > 5) {
      errors.push('missing_information must contain at most five values');
    }
    if (new Set(response.missing_information).size !== response.missing_information.length) {
      errors.push('missing_information values must be unique');
    }
    for (const value of response.missing_information) {
      if (!MISSING_INFORMATION_VALUES.has(value)) {
        errors.push(`missing_information contains an unsupported value: ${value}`);
      }
    }
  }
  validateText(errors, response.qualification_reason, 'qualification_reason', 500);
  if (!RECOMMENDED_ACTION_VALUES.has(response.recommended_action)) {
    errors.push('recommended_action is not an allowed value');
  }
  validateText(errors, response.response_draft, 'response_draft', 500);

  return errors;
}

return $input.all().map((item, index) => {
  const parsedResponse = parseContent(extractContent(item.json));
  const errors = validateResponse(parsedResponse);

  return {
    json: {
      ai_response: parsedResponse,
      ai_validation: {
        is_valid: errors.length === 0,
        errors,
      },
    },
    pairedItem: { item: index },
  };
});
