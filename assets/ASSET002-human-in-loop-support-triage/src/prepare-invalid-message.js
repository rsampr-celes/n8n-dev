const validation = $input.first()?.json?.validation ?? {
  is_valid: false,
  errors: [{ field: 'support_event', code: 'invalid_input' }],
};

return [{
  json: {
    route: 'invalid',
    support_event: null,
    correlation_id: null,
    validation,
  },
}];
