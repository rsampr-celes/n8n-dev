const requestContext = $('Build HubSpot Contact Request').first().json;
const response = $input.first()?.json ?? {};
const contactId =
  response.id ??
  response.vid ??
  response.properties?.hs_object_id ??
  requestContext.contact_request.contact_id ??
  null;

if (contactId === null || contactId === undefined || String(contactId).trim() === '') {
  throw new Error('HubSpot contact response did not include a contact ID');
}

return [{
  json: {
    contact_request: requestContext.contact_request,
    deal_request: requestContext.deal_request,
    deal_match: requestContext.deal_match,
    correlation_id: requestContext.correlation_id,
    contact_result: {
      action: requestContext.contact_request.action,
      contact_id: String(contactId),
    },
  },
}];
