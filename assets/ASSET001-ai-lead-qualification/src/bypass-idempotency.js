const workflowInput = $('When Executed by Another Workflow').first().json;

return $input.all().map((item, index) => ({
  json: {
    lead: workflowInput.lead,
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
