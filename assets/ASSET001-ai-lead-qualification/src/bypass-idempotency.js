return $input.all().map((item, index) => ({
  json: {
    ...item.json,
    idempotency: {
      enabled: false,
      key: null,
      claim_action: 'bypassed',
      should_continue: true,
      outcome: 'continue',
    },
  },
  pairedItem: { item: index },
}));
