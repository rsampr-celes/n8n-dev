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

  if (!isBlank(raw.first_name)) lead.first_name = normalizeText(raw.first_name);
  if (!isBlank(raw.last_name)) lead.last_name = normalizeText(raw.last_name);
  if (!isBlank(raw.email)) lead.email_normalized = String(raw.email).trim().toLowerCase();

  const message = normalizeMessage(raw.message);
  if (message !== undefined) lead.message_sanitized = message;

  const consent = normalizeConsent(raw.consent);
  if (consent !== undefined) lead.consent = consent;

  return lead;
}

return $input.all().map((item, index) => ({
  json: { lead: normalizeLead(item.json) },
  pairedItem: { item: index },
}));
