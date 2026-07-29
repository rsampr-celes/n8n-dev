const normalizedInput = $('When Executed by Another Workflow').first().json;
const candidates = $input.all()
  .filter((item) => item.json?.id !== undefined && item.json?.id !== null)
  .map((item) => String(item.json.id));
const phoneNormalized =
  normalizedInput.lead?.phone_normalized ??
  normalizedInput.phone_normalized ??
  null;

let nextStep = 'decide';
let match;

if (candidates.length === 1) {
  match = {
    decision: 'update',
    status: 'matched',
    matched_by: 'email',
    contact_id: candidates[0],
    match_count: 1,
    candidate_contact_ids: candidates,
    review_reason: null,
  };
} else if (candidates.length > 1) {
  match = {
    decision: 'review',
    status: 'ambiguous',
    matched_by: 'email',
    contact_id: null,
    match_count: candidates.length,
    candidate_contact_ids: candidates,
    review_reason: 'multiple_email_matches',
  };
} else if (phoneNormalized) {
  nextStep = 'search_phone';
  match = null;
} else {
  match = {
    decision: 'create',
    status: 'not_found',
    matched_by: null,
    contact_id: null,
    match_count: 0,
    candidate_contact_ids: [],
    review_reason: null,
  };
}

return [{
  json: {
    normalized_input: normalizedInput,
    next_step: nextStep,
    match,
  },
}];
