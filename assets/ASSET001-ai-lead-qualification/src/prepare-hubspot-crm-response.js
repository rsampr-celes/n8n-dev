const writeContext = $('Attach Deal Response').first().json;

return [{
  json: {
    hubspot_write_success: true,
    correlation_id: writeContext.correlation_id,
    contact: writeContext.contact_result,
    deal: {
      ...writeContext.deal_result,
      associated_contact_id: writeContext.contact_result.contact_id,
    },
  },
}];
