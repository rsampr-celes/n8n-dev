return $input.all().map((item, index) => {
  const claim = item.json;
  const payload = claim.workflow_payload;

  if (!payload || typeof payload !== 'object') {
    throw new Error('Idempotency claim did not return the workflow payload');
  }

  return {
    json: {
      ...payload,
      idempotency: {
        ...payload.idempotency,
        claim_action: claim.claim_action,
        stored_correlation_id: claim.stored_correlation_id,
        stored_status: claim.stored_status,
        previous_result: claim.previous_result ?? null,
        previous_error: claim.previous_error ?? null,
      },
    },
    pairedItem: { item: index },
  };
});
