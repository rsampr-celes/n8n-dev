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

const ALLOWED_FIELDS = new Set(Object.keys(FIELD_LABELS));
const REQUIRED_FIELDS = [
  'first_name',
  'last_name',
  'email_normalized',
  'message_sanitized',
  'consent',
];
const SERVICE_VALUES = new Set([
  'api_integration',
  'crm_automation',
  'ai_workflow',
  'data_integration',
  'other',
  null,
]);
const BUDGET_VALUES = new Set([
  'under_2500',
  '2500_5000',
  '5000_10000',
  'over_10000',
  'not_decided',
  null,
]);
const TIMELINE_VALUES = new Set([
  'immediately',
  'within_one_month',
  'one_to_three_months',
  'later',
  'not_decided',
  null,
]);

function messageFor(field, code) {
  const label = FIELD_LABELS[field] || 'Submission';
  return {
    required: `${label} is required`,
    invalid_type: `${label} has an invalid type`,
    invalid_format: `${label} has an invalid format`,
    invalid_enum: `${label} is not an allowed option`,
    consent_required: 'Consent is required',
    invalid_value: `${label} has an invalid value`,
    min_length: `${label} is too short`,
    max_length: `${label} is too long`,
    unexpected_field: 'Submission contains an unexpected field',
  }[code];
}

function validationError(field, keyword, code, details = {}, schemaPath) {
  return {
    field,
    path: field === null ? '' : `/${String(field).replace(/~/g, '~0').replace(/\//g, '~1')}`,
    code,
    message: messageFor(field, code),
    keyword,
    details,
    schema_path: schemaPath,
  };
}

function stringLength(value) {
  return [...value].length;
}

function isHttpUrl(value) {
  if (/\s/.test(value)) return false;
  const match = value.match(/^https?:\/\/([^/?#]+)(?:[/?#].*)?$/i);
  if (!match) return false;

  const authority = match[1];
  if (authority.includes('@') || authority.startsWith('[')) return false;

  const separator = authority.lastIndexOf(':');
  const hasPort = separator > -1;
  const hostname = hasPort ? authority.slice(0, separator) : authority;
  const port = hasPort ? authority.slice(separator + 1) : null;

  if (
    port !== null &&
    (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535)
  ) {
    return false;
  }

  if (hostname === 'localhost') return true;
  const labels = hostname.split('.');
  return labels.length >= 2 && labels.every(
    (label) =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label),
  );
}

function validateString(errors, lead, field, { minLength, maxLength }) {
  const value = lead[field];
  if (value === undefined) return;
  if (typeof value !== 'string') {
    errors.push(validationError(
      field,
      'type',
      'invalid_type',
      { type: 'string' },
      `#/properties/${field}/type`,
    ));
    return;
  }
  if (minLength !== undefined && stringLength(value) < minLength) {
    errors.push(validationError(
      field,
      'minLength',
      'min_length',
      { limit: minLength },
      `#/properties/${field}/minLength`,
    ));
  }
  if (maxLength !== undefined && stringLength(value) > maxLength) {
    errors.push(validationError(
      field,
      'maxLength',
      'max_length',
      { limit: maxLength },
      `#/properties/${field}/maxLength`,
    ));
  }
}

function validateNullableString(errors, lead, field, maxLength) {
  const value = lead[field];
  if (value === undefined || value === null) return;
  if (typeof value !== 'string') {
    errors.push(validationError(
      field,
      'type',
      'invalid_type',
      { type: ['string', 'null'] },
      `#/properties/${field}/type`,
    ));
    return;
  }
  if (stringLength(value) > maxLength) {
    errors.push(validationError(
      field,
      'maxLength',
      'max_length',
      { limit: maxLength },
      `#/properties/${field}/maxLength`,
    ));
  }
}

function validateEnum(errors, lead, field, allowedValues) {
  const value = lead[field];
  if (value === undefined) return;
  if (!allowedValues.has(value)) {
    errors.push(validationError(
      field,
      'enum',
      'invalid_enum',
      { allowedValues: [...allowedValues] },
      `#/properties/${field}/enum`,
    ));
  }
}

function validateLead(lead) {
  const errors = [];

  if (!lead || typeof lead !== 'object' || Array.isArray(lead)) {
    return [validationError(
      null,
      'type',
      'invalid_type',
      { type: 'object' },
      '#/type',
    )];
  }

  for (const field of Object.keys(lead)) {
    if (!ALLOWED_FIELDS.has(field)) {
      errors.push(validationError(
        field,
        'additionalProperties',
        'unexpected_field',
        {},
        '#/additionalProperties',
      ));
    }
  }

  for (const field of REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(lead, field)) {
      errors.push(validationError(
        field,
        'required',
        field === 'consent' ? 'consent_required' : 'required',
        {},
        '#/required',
      ));
    }
  }

  validateString(errors, lead, 'first_name', { minLength: 1, maxLength: 120 });
  validateString(errors, lead, 'last_name', { minLength: 1, maxLength: 120 });
  validateString(errors, lead, 'email_normalized', { maxLength: 254 });
  validateString(errors, lead, 'message_sanitized', { minLength: 1, maxLength: 5000 });
  validateNullableString(errors, lead, 'company', 160);
  validateNullableString(errors, lead, 'country', 100);

  const email = lead.email_normalized;
  if (
    typeof email === 'string' &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    errors.push(validationError(
      'email_normalized',
      'format',
      'invalid_format',
      { format: 'email' },
      '#/properties/email_normalized/format',
    ));
  }

  const phone = lead.phone_normalized;
  if (phone !== undefined && phone !== null) {
    if (typeof phone !== 'string') {
      errors.push(validationError(
        'phone_normalized',
        'type',
        'invalid_type',
        { type: ['string', 'null'] },
        '#/properties/phone_normalized/type',
      ));
    } else if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
      errors.push(validationError(
        'phone_normalized',
        'pattern',
        'invalid_format',
        {},
        '#/properties/phone_normalized/pattern',
      ));
    }
  }

  const website = lead.company_website;
  if (website !== undefined && website !== null) {
    if (typeof website !== 'string') {
      errors.push(validationError(
        'company_website',
        'type',
        'invalid_type',
        { type: ['string', 'null'] },
        '#/properties/company_website/type',
      ));
    } else {
      if (stringLength(website) > 2048) {
        errors.push(validationError(
          'company_website',
          'maxLength',
          'max_length',
          { limit: 2048 },
          '#/properties/company_website/maxLength',
        ));
      }
      if (!isHttpUrl(website)) {
        errors.push(validationError(
          'company_website',
          'format',
          'invalid_format',
          { format: 'uri' },
          '#/properties/company_website/format',
        ));
      }
    }
  }

  validateEnum(errors, lead, 'service_requested', SERVICE_VALUES);
  validateEnum(errors, lead, 'budget_band', BUDGET_VALUES);
  validateEnum(errors, lead, 'timeline_band', TIMELINE_VALUES);

  if (Object.prototype.hasOwnProperty.call(lead, 'consent') && lead.consent !== true) {
    errors.push(validationError(
      'consent',
      'const',
      'consent_required',
      {},
      '#/properties/consent/const',
    ));
  }

  return errors;
}

return $input.all().map((item, index) => {
  const errors = validateLead(item.json.lead);

  return {
    json: {
      validation: {
        is_valid: errors.length === 0,
        errors,
        warnings: [],
      },
    },
    pairedItem: { item: index },
  };
});
