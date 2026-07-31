const input = $input.first().json.response_input;
const words = `${input.triage.summary} ${input.support_event.message}`
  .toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
return [{ json: { response_input: input, knowledge_query: { category: input.triage.category, terms: [...new Set(words)].slice(0, 20) } } }];
