const { randomUUID } = require('crypto');

return $input.all().map((item, index) => ({
  json: {
    route: 'incoming_customer_message',
    support_event: item.json.support_event,
    correlation_id: randomUUID(),
    validation: item.json.validation,
  },
  pairedItem: { item: index },
}));
