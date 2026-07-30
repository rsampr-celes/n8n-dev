// The build script replaces this marker with an Ajv standalone validator.
// n8n's Code runner blocks Ajv.compile() because it intentionally disallows
// dynamic code generation inside the sandbox.
/*__AJV_STANDALONE_VALIDATOR__*/

const FIELD_LABELS = {
  first_name: 'First name',
  last_name: 'Last name',
  email_normalized: 'Email',
  phone_normalized: 'Phone',
  company: 'Company',
  company_website: 'Company website',
  service_requested: 'Service requested',
  message_sanitized: 'Message',
  budget_band: 'Budget',
  timeline_band: 'Timeline',
  country: 'Country',
  consent: 'Consent',
};

function escapePointer(value) {
  return String(value).replace(/~/g, '~0').replace(/\//g, '~1');
}

function errorLocation(error) {
  if (error.keyword === 'required') {
    const field = error.params.missingProperty;
    return { field, path: `${error.instancePath}/${escapePointer(field)}` };
  }
  if (error.keyword === 'additionalProperties') {
    const field = error.params.additionalProperty;
    return { field, path: `${error.instancePath}/${escapePointer(field)}` };
  }

  const path = error.instancePath || '';
  const field = path
    ? path.split('/').at(-1).replace(/~1/g, '/').replace(/~0/g, '~')
    : null;
  return { field, path };
}

function businessCode(error, field) {
  if (field === 'consent' && (error.keyword === 'required' || error.keyword === 'const')) {
    return 'consent_required';
  }
  return {
    required: 'required',
    type: 'invalid_type',
    format: 'invalid_format',
    pattern: 'invalid_format',
    enum: 'invalid_enum',
    const: 'invalid_value',
    minLength: 'min_length',
    maxLength: 'max_length',
    additionalProperties: 'unexpected_field',
  }[error.keyword] || 'schema_validation_failed';
}

function safeDetails(error) {
  const allowed = ['format', 'type', 'limit', 'allowedValues'];
  return Object.fromEntries(
    Object.entries(error.params || {}).filter(([key]) => allowed.includes(key)),
  );
}

function errorMessage(error, field, code) {
  const label = FIELD_LABELS[field] || 'Submission';
  const messages = {
    required: `${label} is required`,
    invalid_type: `${label} has an invalid type`,
    invalid_format: `${label} has an invalid format`,
    invalid_enum: `${label} is not an allowed option`,
    consent_required: 'Consent is required',
    invalid_value: `${label} has an invalid value`,
    min_length: `${label} is too short`,
    max_length: `${label} is too long`,
    unexpected_field: 'Submission contains an unexpected field',
    schema_validation_failed: `${label} failed schema validation`,
  };
  return messages[code];
}

function mapError(error) {
  const { field, path } = errorLocation(error);
  const code = businessCode(error, field);
  return {
    field,
    path,
    code,
    message: errorMessage(error, field, code),
    keyword: error.keyword,
    details: safeDetails(error),
    schema_path: error.schemaPath,
  };
}

return $input.all().map((item, index) => {
  const isValid = validateLead(item.json.lead);

  return {
    json: {
      validation: {
        is_valid: isValid,
        errors: isValid ? [] : validateLead.errors.map(mapError),
        warnings: [],
      },
    },
    pairedItem: { item: index },
  };
});
