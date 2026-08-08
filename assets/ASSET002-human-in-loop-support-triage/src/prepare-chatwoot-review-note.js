const prepared = $('Execute Prepare Message').first().json;
const triage = $('Execute AI Triage').first().json.triage;
const preparation = $input.first().json.response_preparation;
const lines = [
  'AI support triage — internal review only',
  `Correlation: ${prepared.correlation_id}`,
  `Category: ${triage.category}`,
  `Intent: ${triage.intent}`,
  `Urgency: ${triage.urgency}`,
  `Sentiment: ${triage.sentiment}`,
  `Assigned team: ${triage.assigned_team}`,
  `Triage confidence: ${triage.confidence}`,
  `Route: ${triage.route}`,
  `Reasons: ${triage.reason_codes.join(', ')}`,
  `Summary: ${triage.summary}`,
  '',
  preparation.status === 'draft_ready' ? 'Proposed response:' : 'No response draft was produced. Manual handling is required.',
  preparation.proposed_response ?? '',
  preparation.sources.length ? `Sources: ${preparation.sources.map((source) => `${source.knowledge_id} — ${source.title}`).join('; ')}` : 'Sources: none',
  `Response confidence: ${preparation.confidence}`,
  `Recommended action: ${preparation.recommended_agent_action}`,
  'An authorised agent must review and send any customer-facing response.',
];

return [{ json: {
  account_id: prepared.support_event.account_id,
  conversation_id: prepared.support_event.conversation_id,
  correlation_id: prepared.correlation_id,
  triage,
  response_preparation: preparation,
  chatwoot_request: { content: lines.filter((line, index) => line || index > 0).join('\n').slice(0, 12000), message_type: 'outgoing', private: true },
} }];
