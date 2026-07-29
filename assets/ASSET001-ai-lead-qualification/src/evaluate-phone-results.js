const emailEvaluation = $('Evaluate Email Results').first().json;
const candidates = $input.all()
  .filter((item) => item.json?.id !== undefined && item.json?.id !== null)
  .map((item) => String(item.json.id));

let match;

if (candidates.length === 1) {
  match = {
    decision: 'update',
    status: 'matched',
    matched_by: 'phone',
    contact_id: candidates[0],
    match_count: 1,
    candidate_contact_ids: candidates,
    review_reason: null,
  };
} else if (candidates.length > 1) {
  match = {
    decision: 'review',
    status: 'ambiguous',
    matched_by: 'phone',
    contact_id: null,
    match_count: candidates.length,
    candidate_contact_ids: candidates,
    review_reason: 'multiple_phone_matches',
  };
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
    normalized_input: emailEvaluation.normalized_input,
    next_step: 'decide',
    match,
  },
}];
