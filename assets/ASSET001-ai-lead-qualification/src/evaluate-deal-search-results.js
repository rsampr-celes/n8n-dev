const dealContext = $('Build HubSpot Deal Request').first().json;
const candidates = $input.all()
  .filter((item) => item.json?.id !== undefined && item.json?.id !== null)
  .map((item) => String(item.json.id));

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
    deal_request: dealContext.deal_request,
    deal_match: dealMatch,
    should_write: dealMatch.action !== 'review',
    correlation_id: dealContext.correlation_id,
  },
}];
