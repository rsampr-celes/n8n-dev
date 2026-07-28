const OUTCOMES = {
  claimed: 'continue',
  completed: 'return_previous_result',
  processing: 'accepted_in_progress',
  failed: 'authorized_safe_replay_required',
};

return $input.all().map((item, index) => {
  const payload = item.json;
  const claimAction = payload.idempotency?.claim_action;
  const outcome = OUTCOMES[claimAction];

  if (!outcome) {
    throw new Error(`Unsupported idempotency claim action: ${claimAction}`);
  }

  return {
    json: {
      ...payload,
      idempotency: {
        ...payload.idempotency,
        enabled: true,
        should_continue: claimAction === 'claimed',
        outcome,
      },
    },
    pairedItem: { item: index },
  };
});
