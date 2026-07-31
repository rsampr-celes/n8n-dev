return $input.all().map((item, index) => {
  const event = item.json.support_event;
  return {
    json: {
      route: event.event_kind,
      support_event: event,
      correlation_id: null,
      idempotency_key: null,
      idempotency: { action: 'not_applicable', should_process: false },
      validation: item.json.validation,
    },
    pairedItem: { item: index },
  };
});
