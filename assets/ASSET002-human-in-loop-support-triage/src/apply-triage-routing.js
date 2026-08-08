const input = $input.first().json;
const candidate = input.triage_candidate;
const threshold = 0.75;
const invalid = !input.triage_validation.is_valid;
const flags = candidate?.sensitivity_flags ?? [];
const forcedReasons = [];
if (invalid) forcedReasons.push('invalid_ai_output');
if (candidate && candidate.confidence < threshold) forcedReasons.push('low_triage_confidence');
if (flags.length) forcedReasons.push('sensitive_subject');
if (candidate && ['critical'].includes(candidate.urgency)) forcedReasons.push('critical_urgency');
if (candidate && ['angry', 'distressed'].includes(candidate.sentiment)) forcedReasons.push('customer_distress');
if (candidate && ['cancellation_refund'].includes(candidate.category)) forcedReasons.push('refund_or_cancellation');

const fallback = {
  category: 'unknown', intent: 'unknown', urgency: 'high', sentiment: 'neutral',
  assigned_team: 'specialist_review', sensitivity_flags: [], confidence: 0,
  summary: 'AI triage output could not be validated.', escalation_reason: 'invalid_ai_output',
};
const triage = candidate ?? fallback;
const requiresPriorityReview = forcedReasons.length > 0;

return [{ json: {
  triage: {
    ...triage,
    route: requiresPriorityReview ? 'priority_review' : 'standard_review',
    requires_human_review: true,
    reason_codes: forcedReasons.length ? forcedReasons : ['standard_agent_review'],
  },
  validation: input.triage_validation,
} }];
