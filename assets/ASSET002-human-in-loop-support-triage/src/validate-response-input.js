const input = $input.first().json;
const errors = [];
if (!input.support_event || typeof input.support_event !== 'object') errors.push({ field: 'support_event', code: 'required' });
if (!input.triage || typeof input.triage !== 'object') errors.push({ field: 'triage', code: 'required' });
if (input.support_event && typeof input.support_event.message !== 'string') errors.push({ field: 'support_event.message', code: 'required' });
if (input.triage && typeof input.triage.safe_for_drafting !== 'boolean') errors.push({ field: 'triage.safe_for_drafting', code: 'required' });

return [{ json: { response_input: errors.length ? null : input, validation: { is_valid: errors.length === 0, errors }, should_search: errors.length === 0 && input.triage.safe_for_drafting === true } }];
