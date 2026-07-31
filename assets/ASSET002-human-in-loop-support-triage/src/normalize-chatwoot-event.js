const workflowItem = $input.first()?.json ?? {};
const raw = workflowItem.raw_event && typeof workflowItem.raw_event === 'object'
  ? workflowItem.raw_event
  : workflowItem;
const payload = raw.body && typeof raw.body === 'object' ? raw.body : raw;

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function finiteId(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value.trim())) return value.trim();
  return null;
}

const messageType = payload.message_type === 0 || payload.message_type === 'incoming'
  ? 'incoming'
  : payload.message_type === 1 || payload.message_type === 'outgoing'
    ? 'outgoing'
    : 'unknown';
const isPrivate = payload.private === true;
const eventName = cleanText(payload.event, 100);
const eventKind = eventName === 'message_created' && messageType === 'incoming'
  ? 'incoming_customer_message'
  : eventName === 'message_created' && messageType === 'outgoing' && !isPrivate
    ? 'agent_public_message'
    : 'ignored';

return [{
  json: {
    event_kind: eventKind,
    event_name: eventName,
    conversation_id: finiteId(payload.conversation?.id ?? payload.conversation_id),
    message_id: finiteId(payload.id ?? payload.message?.id),
    inbox_id: finiteId(payload.inbox?.id ?? payload.conversation?.inbox_id),
    account_id: finiteId(payload.account?.id ?? payload.account_id),
    channel: cleanText(payload.conversation?.channel ?? payload.channel, 100),
    message: cleanText(payload.content ?? payload.message?.content, 8000),
    sender_name: cleanText(payload.sender?.name, 200),
    sender_email: cleanText(payload.sender?.email, 320)?.toLowerCase() ?? null,
    occurred_at: typeof payload.created_at === 'number'
      ? new Date(payload.created_at * 1000).toISOString()
      : cleanText(payload.created_at, 100),
  },
}];
