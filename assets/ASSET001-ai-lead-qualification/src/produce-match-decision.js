return $input.all().map((item, index) => {
  return {
    json: {
      crm_match: item.json.match,
    },
    pairedItem: { item: index },
  };
});
