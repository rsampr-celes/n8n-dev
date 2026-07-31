const ALLOWED_FIELDS = new Set([
  'event_kind', 'event_name', 'conversation_id', 'message_id', 'inbox_id',
  'account_id', 'channel', 'message', 'sender_name', 'sender_email', 'occurred_at',
]);

return $input.all().map((item, index) => {
  const value = item.json ?? {};
  const errors = [];
  for (const key of Object.keys(value)) {
    if (!ALLOWED_FIELDS.has(key)) errors.push({ field: key, code: 'undeclared_property' });
  }
  if (!['incoming_customer_message', 'agent_public_message', 'ignored'].includes(value.event_kind)) {
    errors.push({ field: 'event_kind', code: 'invalid_enum' });
  }
  if (value.event_kind !== 'ignored') {
    if (!value.conversation_id) errors.push({ field: 'conversation_id', code: 'required' });
    if (!value.message_id) errors.push({ field: 'message_id', code: 'required' });
    if (!value.account_id) errors.push({ field: 'account_id', code: 'required' });
    if (!value.message) errors.push({ field: 'message', code: 'required' });
  }
  if (value.sender_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.sender_email)) {
    errors.push({ field: 'sender_email', code: 'invalid_format' });
  }

  return {
    json: {
      support_event: errors.length === 0 ? value : null,
      validation: { is_valid: errors.length === 0, errors },
    },
    pairedItem: { item: index },
  };
});
