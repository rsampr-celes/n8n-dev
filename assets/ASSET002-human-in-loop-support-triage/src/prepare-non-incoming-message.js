return $input.all().map((item, index) => {
  const event = item.json.support_event;
  return {
    json: {
      route: event.event_kind,
      support_event: event,
      correlation_id: null,
      validation: item.json.validation,
    },
    pairedItem: { item: index },
  };
});
