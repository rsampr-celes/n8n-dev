const { randomUUID } = require('crypto');

const configRow = $input.first()?.json ?? {};
const workflowInput = $('When Executed by Another Workflow').first().json;
const rowFound = configRow.key === 'idempotency_enabled';

// Fail safe: only an explicit Boolean false disables the guard.
const enabled = rowFound ? configRow.enabled !== false : true;

return [{
  json: {
    correlation_id: randomUUID(),
    email_normalized: workflowInput.lead.email_normalized,
    phone_normalized: workflowInput.lead.phone_normalized ?? null,
    idempotency_enabled: enabled,
  },
}];
