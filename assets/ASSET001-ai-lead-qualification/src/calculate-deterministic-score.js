const PRIMARY_SERVICE_CATEGORIES = new Set([
  'api_integration',
  'crm_automation',
  'ai_workflow',
  'data_integration',
]);
const PURCHASE_INTENT_POINTS = {
  strong: 20,
  moderate: 10,
  weak: 0,
  unknown: 0,
};
const TIMELINE_POINTS = {
  immediately: 15,
  within_one_month: 15,
  one_to_three_months: 10,
  later: 5,
  not_decided: 0,
};

function problemClarityPoints(message, problemSummary) {
  if (!problemSummary || !message) return 0;
  if (message.length >= 80) return 20;
  if (message.length >= 30) return 15;
  return 10;
}

const qualificationContext =
  $('When Executed by Another Workflow').first().json;

return $input.all().map((item, index) => {
  const lead = qualificationContext.lead ?? {};
  const ai = item.json.ai_response;

  const requestedService = lead.service_requested ?? null;
  let serviceFit = 0;
  if (
    requestedService &&
    ai.service_category === requestedService &&
    PRIMARY_SERVICE_CATEGORIES.has(requestedService)
  ) {
    serviceFit = 30;
  } else if (PRIMARY_SERVICE_CATEGORIES.has(ai.service_category)) {
    serviceFit = 20;
  } else if (ai.service_category === 'other') {
    serviceFit = 10;
  }

  const problemClarity = problemClarityPoints(
    lead.message_sanitized,
    ai.problem_summary,
  );
  const purchaseIntent = PURCHASE_INTENT_POINTS[ai.purchase_intent] ?? 0;
  const timeline = TIMELINE_POINTS[lead.timeline_band] ?? 0;
  const budgetInformation =
    lead.budget_band && lead.budget_band !== 'not_decided' ? 10 : 0;
  const contactCompleteness = [
    lead.first_name,
    lead.last_name,
    lead.email_normalized,
    lead.phone_normalized,
    lead.company,
  ].filter(Boolean).length;

  const components = {
    service_fit: serviceFit,
    problem_clarity: problemClarity,
    purchase_intent: purchaseIntent,
    timeline,
    budget_information: budgetInformation,
    contact_completeness: contactCompleteness,
  };
  const finalScore = Object.values(components).reduce(
    (total, value) => total + value,
    0,
  );

  let finalRoute;
  let routeReason;
  if (ai.confidence < 0.75) {
    finalRoute = 'human_review';
    routeReason = 'low_ai_confidence';
  } else if (finalScore >= 80) {
    finalRoute = 'sales_qualified';
    routeReason = 'score_80_to_100';
  } else if (finalScore >= 50) {
    finalRoute = 'human_review';
    routeReason = 'score_50_to_79';
  } else {
    finalRoute = 'nurture';
    routeReason = 'score_0_to_49';
  }

  return {
    json: {
      ...item.json,
      deterministic_decision: {
        final_score: finalScore,
        final_route: finalRoute,
        route_reason: routeReason,
        score_components: components,
        ai_estimated_fit_score: ai.estimated_fit_score,
        ai_recommended_action: ai.recommended_action,
      },
    },
    pairedItem: { item: index },
  };
});
