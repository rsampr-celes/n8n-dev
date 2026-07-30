return $input.all().map((item, index) => {
  return {
    json: {
      hubspot_search_success: true,
      crm_action: item.json.match.decision,
      crm_match: item.json.match,
    },
    pairedItem: { item: index },
  };
});
