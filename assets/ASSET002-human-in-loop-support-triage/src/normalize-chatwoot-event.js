const workflowItem = $input.first()?.json ?? {};
const raw = workflowItem.raw_event && typeof workflowItem.raw_event === 'object'
  ? workflowItem.raw_event
  : workflowItem;
const payload = raw.body && typeof raw.body === 'object' ? raw.body : raw;
const automationMessage = Array.isArray(payload.messages) && payload.messages.length
  ? payload.messages[0]
  : null;

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

const rawMessageType = payload.message_type ?? automationMessage?.message_type;
const messageType = rawMessageType === 0 || rawMessageType === 'incoming'
  ? 'incoming'
  : rawMessageType === 1 || rawMessageType === 'outgoing'
    ? 'outgoing'
    : 'unknown';
const eventName = cleanText(payload.event, 100);
const isMessageCreated = eventName === 'message_created' || eventName === 'automation_event.message_created';
const eventKind = isMessageCreated && messageType === 'incoming'
  ? 'incoming_customer_message'
  : 'ignored';

return [{
  json: {
    event_kind: eventKind,
    event_name: eventName,
    conversation_id: finiteId(payload.conversation?.id ?? payload.conversation_id ?? automationMessage?.conversation_id ?? payload.id),
    message_id: finiteId(payload.message?.id ?? automationMessage?.id ?? payload.id),
    inbox_id: finiteId(payload.inbox?.id ?? payload.conversation?.inbox_id ?? automationMessage?.inbox_id ?? payload.inbox_id),
    account_id: finiteId(payload.account?.id ?? payload.account_id ?? automationMessage?.account_id),
    channel: cleanText(payload.conversation?.channel ?? payload.channel, 100),
    message: cleanText(payload.content ?? payload.message?.content ?? automationMessage?.content, 8000),
    sender_name: cleanText(payload.sender?.name ?? automationMessage?.sender?.name ?? payload.meta?.sender?.name, 200),
    sender_email: cleanText(payload.sender?.email ?? automationMessage?.sender?.email ?? payload.meta?.sender?.email, 320)?.toLowerCase() ?? null,
    occurred_at: typeof (payload.created_at ?? automationMessage?.created_at) === 'number'
      ? new Date((payload.created_at ?? automationMessage.created_at) * 1000).toISOString()
      : cleanText(payload.created_at ?? automationMessage?.created_at, 100),
  },
}];
