const context = $('When Executed by Another Workflow').first().json;

function requireObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value;
}

function requireText(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function optionalText(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized === '' ? null : normalized;
}

function compactProperties(properties) {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => (
      value !== undefined &&
      value !== null &&
      !(typeof value === 'string' && value.trim() === '')
    )),
  );
}

function boundedText(value, fallback, maximumLength = 500) {
  const normalized = optionalText(value) ?? fallback;
  return normalized.slice(0, maximumLength);
}

const lead = requireObject(context.lead, 'lead');
const aiResult = requireObject(context.ai_result, 'ai_result');
const correlationId = requireText(context.correlation_id, 'correlation_id');
const submissionReference =
  optionalText(context.submission_reference) ?? correlationId;
const ai = aiResult.ai_response ?? {};
const decision =
  aiResult.deterministic_decision ??
  aiResult.review_outcome ??
  null;
requireObject(decision, 'ai_result decision');

const isReviewOutcome = Boolean(aiResult.review_outcome);
const finalRoute =
  optionalText(decision.final_route) ??
  (isReviewOutcome ? 'human_review' : null);
const routeReason =
  optionalText(decision.route_reason) ??
  (isReviewOutcome ? 'invalid_ai_response' : 'qualification_completed');

if (!finalRoute) {
  throw new Error('A final qualification route is required');
}

const requestedService = optionalText(lead.service_requested);
const serviceCategory =
  optionalText(ai.service_category) && ai.service_category !== 'unknown'
    ? ai.service_category
    : requestedService ?? 'other';
const companyOrContact =
  optionalText(lead.company) ??
  optionalText(
    [optionalText(lead.first_name), optionalText(lead.last_name)]
      .filter(Boolean)
      .join(' '),
  ) ??
  requireText(lead.email_normalized, 'lead.email_normalized');
const qualificationExplanation = isReviewOutcome
  ? `Human review required: ${routeReason}`
  : boundedText(
    ai.qualification_reason,
    `Qualification completed: ${routeReason}`,
  );
const dealQualificationProperties = compactProperties({
  dealname: `${companyOrContact} - ${serviceCategory}`,
  service_category: serviceCategory,
  lead_score:
    Number.isInteger(decision.final_score)
      ? String(decision.final_score)
      : null,
  qualification_status: finalRoute,
  urgency: optionalText(ai.urgency) ?? 'unknown',
  problem_summary: boundedText(
    ai.problem_summary,
    boundedText(
      lead.message_sanitized,
      'Qualification output requires human review.',
    ),
  ),
  ai_confidence:
    typeof ai.confidence === 'number' ? String(ai.confidence) : '0',
  qualification_explanation: qualificationExplanation,
  workflow_correlation_id: correlationId,
  original_submission_reference: submissionReference,
});

return [{
  json: {
    deal_request: {
      search_request: {
        filterGroups: [{
          filters: [{
            propertyName: 'workflow_correlation_id',
            operator: 'EQ',
            value: correlationId,
          }],
        }],
        properties: [
          'dealname',
          'workflow_correlation_id',
          'original_submission_reference',
        ],
        limit: 2,
      },
      create_properties: {
        ...dealQualificationProperties,
        pipeline: optionalText(context.hubspot_pipeline_id) ?? 'default',
        dealstage:
          optionalText(context.hubspot_dealstage_id) ??
          'appointmentscheduled',
      },
      update_properties: dealQualificationProperties,
    },
    correlation_id: correlationId,
  },
}];
