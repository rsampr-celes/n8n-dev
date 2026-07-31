const { createHash, randomUUID } = require('crypto');

return $input.all().map((item, index) => {
  const event = item.json.support_event;
  const source = `${event.account_id}|${event.conversation_id}|${event.message_id}|${event.event_kind}`;
  return {
    json: {
      support_event: event,
      correlation_id: randomUUID(),
      idempotency_key: createHash('sha256').update(source, 'utf8').digest('hex'),
    },
    pairedItem: { item: index },
  };
});
