const response = $input.first()?.json ?? {};
const providerContent = response.choices?.[0]?.message?.content ?? null;
const errors = [];
let value = null;
try {
  value = typeof providerContent === 'string' ? JSON.parse(providerContent) : null;
} catch {
  errors.push({ field: 'provider_content', code: 'invalid_json' });
}

const enums = {
  category: ['account_access', 'billing_payments', 'orders_delivery', 'product_information', 'technical_support', 'cancellation_refund', 'complaint', 'general_enquiry', 'unknown'],
  intent: ['information', 'problem_resolution', 'transaction_request', 'complaint', 'cancellation', 'refund', 'security_report', 'other', 'unknown'],
  urgency: ['low', 'normal', 'high', 'critical'],
  sentiment: ['positive', 'neutral', 'negative', 'angry', 'distressed'],
  assigned_team: ['general_support', 'billing', 'technical', 'orders', 'account_security', 'retention', 'specialist_review'],
};
const required = [...Object.keys(enums), 'sensitivity_flags', 'confidence', 'summary', 'escalation_reason'];
if (!value || typeof value !== 'object' || Array.isArray(value)) {
  if (!errors.length) errors.push({ field: 'provider_content', code: 'invalid_type' });
} else {
  for (const key of required) if (!(key in value)) errors.push({ field: key, code: 'required' });
  for (const [key, allowed] of Object.entries(enums)) {
    if (!allowed.includes(value[key])) errors.push({ field: key, code: 'invalid_enum' });
  }
  const allowedFlags = ['personal_data', 'security', 'legal_compliance', 'financial_exception', 'harmful_content'];
  if (!Array.isArray(value.sensitivity_flags) || value.sensitivity_flags.some((flag) => !allowedFlags.includes(flag))) {
    errors.push({ field: 'sensitivity_flags', code: 'invalid_items' });
  } else if (value.sensitivity_flags.length > 5 || new Set(value.sensitivity_flags).size !== value.sensitivity_flags.length) {
    errors.push({ field: 'sensitivity_flags', code: 'invalid_cardinality' });
  }
  if (typeof value.confidence !== 'number' || value.confidence < 0 || value.confidence > 1) errors.push({ field: 'confidence', code: 'out_of_range' });
  if (typeof value.summary !== 'string' || !value.summary.trim() || value.summary.length > 500) errors.push({ field: 'summary', code: 'invalid_length' });
  if (value.escalation_reason !== null && (typeof value.escalation_reason !== 'string' || value.escalation_reason.length > 200)) errors.push({ field: 'escalation_reason', code: 'invalid_type' });
  const allowedKeys = new Set(required);
  for (const key of Object.keys(value)) if (!allowedKeys.has(key)) errors.push({ field: key, code: 'undeclared_property' });
}

return [{ json: { triage_candidate: errors.length ? null : value, triage_validation: { is_valid: errors.length === 0, errors } } }];
