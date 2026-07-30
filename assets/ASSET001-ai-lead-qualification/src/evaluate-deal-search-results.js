const crmRequest = $('Build HubSpot CRM Request').first().json;
const response = $input.first()?.json ?? {};
const candidates = Array.isArray(response.results)
  ? response.results
    .filter((candidate) => candidate?.id !== undefined && candidate?.id !== null)
    .map((candidate) => String(candidate.id))
  : [];

let dealMatch;
if (candidates.length === 0) {
  dealMatch = {
    action: 'create',
    deal_id: null,
    match_count: 0,
    candidate_deal_ids: [],
    review_reason: null,
  };
} else if (candidates.length === 1) {
  dealMatch = {
    action: 'update',
    deal_id: candidates[0],
    match_count: 1,
    candidate_deal_ids: candidates,
    review_reason: null,
  };
} else {
  dealMatch = {
    action: 'review',
    deal_id: null,
    match_count: candidates.length,
    candidate_deal_ids: candidates,
    review_reason: 'multiple_deals_for_correlation_id',
  };
}

return [{
  json: {
    crm_request: crmRequest,
    deal_match: dealMatch,
    should_write: dealMatch.action !== 'review',
  },
}];
