return $input.all().map((item, index) => {
  const payload = item.json;

  return {
    json: {
      ...payload.normalized_input,
      crm_match: payload.match,
    },
    pairedItem: { item: index },
  };
});
