const contactContext = $('Attach Contact Response').first().json;
const response = $input.first()?.json ?? {};
const dealId =
  response.id ??
  response.properties?.hs_object_id ??
  contactContext.deal_match.deal_id ??
  null;

if (dealId === null || dealId === undefined || String(dealId).trim() === '') {
  throw new Error('HubSpot deal response did not include a deal ID');
}

return [{
  json: {
    correlation_id: contactContext.crm_request.correlation_id,
    contact_result: contactContext.contact_result,
    deal_result: {
      action: contactContext.deal_match.action,
      deal_id: String(dealId),
    },
  },
}];
