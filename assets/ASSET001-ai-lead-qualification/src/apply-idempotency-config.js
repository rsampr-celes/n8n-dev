const configRow = $input.first()?.json ?? {};
const workflowInput = $('When Executed by Another Workflow').first().json;
const rowFound = configRow.key === 'idempotency_enabled';

// Fail safe: only an explicit Boolean false disables the guard.
const enabled = rowFound ? configRow.enabled !== false : true;

return [{
  json: {
    ...workflowInput,
    config: {
      ...(workflowInput.config ?? {}),
      idempotency_enabled: enabled,
      idempotency_config_source: 'data_table',
      idempotency_config_row_found: rowFound,
    },
  },
}];
