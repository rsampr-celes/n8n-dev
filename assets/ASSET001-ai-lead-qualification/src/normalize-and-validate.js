const { randomUUID } = require('crypto');

// The build script replaces this marker with an Ajv standalone validator.
// n8n's Code runner blocks Ajv.compile() because it intentionally disallows
// dynamic code generation inside the sandbox.
/*__AJV_STANDALONE_VALIDATOR__*/

const SCHEMA_VERSION = '1.0.0';
const CONSENT_TEXT = 'I consent to the processing of this demonstration enquiry';

const SERVICE_MAP = {
  'API integration': 'api_integration',
  'CRM automation': 'crm_automation',
  'AI workflow': 'ai_workflow',
  'Data integration': 'data_integration',
  Other: 'other',
};

const BUDGET_MAP = {
  'Under $2,500': 'under_2500',
  '$2,500–$5,000': '2500_5000',
  '$5,000–$10,000': '5000_10000',
  'Over $10,000': 'over_10000',
  'Not decided': 'not_decided',
};

const TIMELINE_MAP = {
  Immediately: 'immediately',
  'Within one month': 'within_one_month',
  '1–3 months': 'one_to_three_months',
  Later: 'later',
  'Not decided': 'not_decided',
};

const FIELD_LABELS = {
  full_name: 'Full name',
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

function isBlank(value) {
  return value === undefined || value === null ||
    (typeof value === 'string' && value.trim() === '');
}

function normalizeText(value) {
  return String(value).trim().replace(/\s+/g, ' ');
}

function optionalText(value) {
  return isBlank(value) ? null : normalizeText(value);
}

function normalizeMapped(value, mapping) {
  if (isBlank(value)) return null;
  const normalized = normalizeText(value);
  return Object.prototype.hasOwnProperty.call(mapping, normalized)
    ? mapping[normalized]
    : normalized;
}

function normalizePhone(value) {
  if (isBlank(value)) return null;
  return String(value).trim().replace(/[\s().-]/g, '');
}

function normalizeUrl(value) {
  if (isBlank(value)) return null;
  const normalized = String(value).trim();
  try {
    const url = new URL(normalized);
    url.hash = '';
    return url.toString();
  } catch {
    return normalized;
  }
}

function normalizeMessage(value) {
  if (isBlank(value)) return undefined;
  return String(value)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

function normalizeConsent(value) {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    return value.length === 1 && value[0] === CONSENT_TEXT;
  }
  return value === CONSENT_TEXT || value === true;
}

function normalizeLead(raw) {
  const lead = {
    phone_normalized: normalizePhone(raw.phone),
    company: optionalText(raw.company),
    company_website: normalizeUrl(raw.company_website),
    service_requested: normalizeMapped(raw.service_requested, SERVICE_MAP),
    budget_band: normalizeMapped(raw.budget, BUDGET_MAP),
    timeline_band: normalizeMapped(raw.timeline, TIMELINE_MAP),
    country: optionalText(raw.country),
  };

  if (!isBlank(raw.full_name)) lead.full_name = normalizeText(raw.full_name);
  if (!isBlank(raw.email)) lead.email_normalized = String(raw.email).trim().toLowerCase();

  const message = normalizeMessage(raw.message);
  if (message !== undefined) lead.message_sanitized = message;

  const consent = normalizeConsent(raw.consent);
  if (consent !== undefined) lead.consent = consent;

  return lead;
}

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
  const raw = item.json;
  const lead = normalizeLead(raw);
  const isValid = validateLead(lead);
  const submissionReference = optionalText(raw.submission_reference);

  return {
    json: {
      context: {
        correlation_id: randomUUID(),
        received_at: new Date().toISOString(),
        submission_reference: submissionReference,
        source: 'n8n_form',
        schema: 'lead-submission',
        schema_version: SCHEMA_VERSION,
      },
      lead,
      validation: {
        is_valid: isValid,
        errors: isValid ? [] : validateLead.errors.map(mapError),
        warnings: [],
      },
    },
    pairedItem: { item: index },
  };
});
