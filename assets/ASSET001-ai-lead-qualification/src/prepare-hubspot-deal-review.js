const decision = $input.first()?.json ?? {};

return [{
  json: {
    hubspot_write_success: false,
    correlation_id: decision.crm_request?.correlation_id ?? null,
    contact: null,
    deal: {
      action: 'review',
      deal_id: null,
      candidate_deal_ids:
        decision.deal_match?.candidate_deal_ids ?? [],
      review_reason:
        decision.deal_match?.review_reason ??
        'ambiguous_deal_match',
    },
  },
}];
