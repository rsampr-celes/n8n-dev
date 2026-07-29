const configRow = $input.first()?.json ?? {};
const workflowInput = $('When Executed by Another Workflow').first().json;
const rowFound = configRow.key === 'idempotency_enabled';

// Fail safe: only an explicit Boolean false disables the guard.
const enabled = rowFound ? configRow.enabled !== false : true;

return [{
  json: {
    correlation_id: workflowInput.context.correlation_id,
    email_normalized: workflowInput.lead.email_normalized,
    phone_normalized: workflowInput.lead.phone_normalized ?? null,
    submission_reference: workflowInput.context.submission_reference ?? null,
    idempotency_enabled: enabled,
  },
}];
