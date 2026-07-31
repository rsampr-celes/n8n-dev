const claim = $('Execute Prepare Message').first().json;
const response = $input.first()?.json ?? {};
const messages = Array.isArray(response.payload) ? response.payload : [];
const currentMessageId = claim.support_event.message_id;

const conversationContext = messages
  .filter((message) => message && message.private !== true && String(message.id ?? '') !== currentMessageId)
  .filter((message) => message.message_type === 0 || message.message_type === 1 || message.message_type === 'incoming' || message.message_type === 'outgoing')
  .slice(-10)
  .map((message) => ({
    role: message.message_type === 1 || message.message_type === 'outgoing' ? 'agent' : 'customer',
    content: typeof message.content === 'string'
      ? message.content.replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim().slice(0, 2000)
      : '',
  }))
  .filter((message) => message.content);

return [{ json: { support_event: claim.support_event, conversation_context: conversationContext } }];
