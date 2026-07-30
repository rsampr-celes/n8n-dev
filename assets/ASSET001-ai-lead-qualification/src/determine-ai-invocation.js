return $input.all().map((item, index) => {
  const crmMatch = item.json.crm_match ?? null;
  const hubspotSearchSuccess = item.json.hubspot_search_success === true;
  const crmAction = item.json.crm_action ?? crmMatch?.decision ?? null;
  const continueToAi =
    hubspotSearchSuccess === true &&
    ['create', 'update'].includes(crmAction);

  let skipReason = null;
  if (!continueToAi) {
    if (!hubspotSearchSuccess) {
      skipReason = 'hubspot_search_failed';
    } else if (crmAction === 'review') {
      skipReason = crmMatch?.review_reason ?? 'ambiguous_crm_match';
    } else {
      skipReason = 'unsupported_crm_action';
    }
  }

  return {
    json: {
      continue_to_ai: continueToAi,
      ai_skip_reason: skipReason,
    },
    pairedItem: { item: index },
  };
});
