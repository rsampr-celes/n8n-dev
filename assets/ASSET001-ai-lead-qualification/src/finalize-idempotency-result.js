const OUTCOMES = {
  claimed: 'continue',
  completed: 'return_previous_result',
  processing: 'accepted_in_progress',
  failed: 'authorized_safe_replay_required',
};

return $input.all().map((item, index) => {
  const claim = item.json;
  const claimAction = claim.claim_action;
  const outcome = OUTCOMES[claimAction];

  if (!outcome) {
    throw new Error(`Unsupported idempotency claim action: ${claimAction}`);
  }

  return {
    json: {
      idempotency: {
        enabled: true,
        key: claim.idempotency_key,
        claim_action: claimAction,
        stored_correlation_id: claim.stored_correlation_id,
        stored_status: claim.stored_status,
        previous_result: claim.previous_result ?? null,
        previous_error: claim.previous_error ?? null,
        should_continue: claimAction === 'claimed',
        outcome,
      },
    },
    pairedItem: { item: index },
  };
});
