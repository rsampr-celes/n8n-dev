const claim = $('Prepare Idempotency Claim').first().json;
const result = $input.first()?.json ?? {};
const action = result.claim_action === 'claimed' ? 'claimed' : 'duplicate';

return [{
  json: {
    route: action === 'claimed' ? 'incoming_new' : 'incoming_duplicate',
    support_event: claim.support_event,
    correlation_id: claim.correlation_id,
    idempotency_key: claim.idempotency_key,
    idempotency: {
      action,
      should_process: action === 'claimed',
    },
  },
}];
