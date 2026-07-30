const qualificationContext =
  $('When Executed by Another Workflow').first().json;
const crmMatch = qualificationContext.crm_match ?? null;

return $input.all().map((item, index) => ({
  json: {
    review_outcome: {
      final_score: null,
      final_route: 'human_review',
      route_reason: 'invalid_ai_response',
      validation_errors: item.json.ai_validation?.errors ?? [],
      crm_action:
        qualificationContext.crm_action ??
        crmMatch?.decision ??
        null,
      contact_id: crmMatch?.contact_id ?? null,
    },
  },
  pairedItem: { item: index },
}));
