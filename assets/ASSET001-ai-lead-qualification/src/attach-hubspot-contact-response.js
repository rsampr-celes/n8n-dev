const decision = $('Evaluate Deal Search').first().json;
const response = $input.first()?.json ?? {};
const contactId =
  response.id ??
  response.properties?.hs_object_id ??
  decision.crm_request.contact.contact_id ??
  null;

if (contactId === null || contactId === undefined || String(contactId).trim() === '') {
  throw new Error('HubSpot contact response did not include a contact ID');
}

return [{
  json: {
    crm_request: decision.crm_request,
    deal_match: decision.deal_match,
    contact_result: {
      action: decision.crm_request.contact.action,
      contact_id: String(contactId),
    },
  },
}];
