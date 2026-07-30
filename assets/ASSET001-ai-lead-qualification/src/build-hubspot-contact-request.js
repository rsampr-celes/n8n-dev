const context = $('When Executed by Another Workflow').first().json;
const dealDecision = $input.first()?.json ?? {};

function requireObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value;
}

function requireText(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function optionalText(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized === '' ? null : normalized;
}

function compactProperties(properties) {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => (
      value !== undefined &&
      value !== null &&
      !(typeof value === 'string' && value.trim() === '')
    )),
  );
}

const lead = requireObject(context.lead, 'lead');
const crmMatch = requireObject(context.crm_match, 'crm_match');
const crmAction = requireText(context.crm_action, 'crm_action');
const receivedAt = optionalText(context.received_at) ?? new Date().toISOString();

if (!['create', 'update'].includes(crmAction)) {
  throw new Error(`Unsupported crm_action: ${crmAction}`);
}
if (crmAction === 'update' && !optionalText(crmMatch.contact_id)) {
  throw new Error('crm_match.contact_id is required for a contact update');
}

const contactRequest = {
  action: crmAction,
  write_mode:
    crmAction === 'update' && crmMatch.matched_by !== 'email'
      ? 'update_by_id'
      : 'upsert_by_email',
  contact_id: optionalText(crmMatch.contact_id),
  properties: compactProperties({
    firstname: optionalText(lead.first_name),
    lastname: optionalText(lead.last_name),
    email: requireText(lead.email_normalized, 'lead.email_normalized')
      .toLowerCase(),
    phone: optionalText(lead.phone_normalized),
    company: optionalText(lead.company),
    source: optionalText(context.source) ?? 'portfolio_demo',
    consent_status: String(lead.consent === true),
    consent_timestamp: receivedAt,
    last_enquiry_date: receivedAt,
  }),
};

return [{
  json: {
    contact_request: contactRequest,
    deal_request: dealDecision.deal_request,
    deal_match: dealDecision.deal_match,
    correlation_id: dealDecision.correlation_id,
  },
}];
