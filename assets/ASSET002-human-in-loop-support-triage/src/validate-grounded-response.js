const input = $input.first().json;
const errors = [];
let value = null;
try { value = typeof input.provider_content === 'string' ? JSON.parse(input.provider_content) : null; }
catch { errors.push({ field: 'provider_content', code: 'invalid_json' }); }
const sourceIds = new Set(input.selected.knowledge.map((entry) => entry.knowledge_id));
const allowedActions = ['approve', 'edit_and_approve', 'request_more_information', 'manual_response'];
const required = ['proposed_response', 'source_ids', 'confidence', 'recommended_agent_action', 'warnings'];
if (!value || typeof value !== 'object' || Array.isArray(value)) {
  if (!errors.length) errors.push({ field: 'provider_content', code: 'invalid_type' });
} else {
  for (const key of required) if (!(key in value)) errors.push({ field: key, code: 'required' });
  if (typeof value.proposed_response !== 'string' || !value.proposed_response.trim() || value.proposed_response.length > 4000) errors.push({ field: 'proposed_response', code: 'invalid_length' });
  if (!Array.isArray(value.source_ids) || value.source_ids.length === 0 || value.source_ids.some((id) => !sourceIds.has(id))) errors.push({ field: 'source_ids', code: 'unsupported_source' });
  else if (value.source_ids.length > 3 || new Set(value.source_ids).size !== value.source_ids.length) errors.push({ field: 'source_ids', code: 'invalid_cardinality' });
  if (typeof value.confidence !== 'number' || value.confidence < 0 || value.confidence > 1) errors.push({ field: 'confidence', code: 'out_of_range' });
  if (!allowedActions.includes(value.recommended_agent_action)) errors.push({ field: 'recommended_agent_action', code: 'invalid_enum' });
  if (!Array.isArray(value.warnings) || value.warnings.length > 5 || value.warnings.some((warning) => typeof warning !== 'string' || warning.length > 200)) errors.push({ field: 'warnings', code: 'invalid_items' });
  const allowedKeys = new Set(required);
  for (const key of Object.keys(value)) if (!allowedKeys.has(key)) errors.push({ field: key, code: 'undeclared_property' });
}
const usable = errors.length === 0 && value.confidence >= 0.75;
return [{ json: {
  response_preparation: usable ? {
    status: 'draft_ready', proposed_response: value.proposed_response,
    sources: input.selected.knowledge.filter((entry) => value.source_ids.includes(entry.knowledge_id)).map(({ knowledge_id, title, source_url }) => ({ knowledge_id, title, source_url })),
    confidence: value.confidence, recommended_agent_action: value.recommended_agent_action,
    warnings: value.warnings, requires_human_approval: true,
  } : {
    status: 'manual_handling', proposed_response: null, sources: [], confidence: value?.confidence ?? 0,
    recommended_agent_action: 'manual_response', warnings: errors.length ? ['invalid_ai_output'] : ['low_response_confidence'], requires_human_approval: true,
  },
  validation: { is_valid: errors.length === 0, errors },
} }];
