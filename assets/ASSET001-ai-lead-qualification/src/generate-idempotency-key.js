const { createHash } = require('crypto');

function stableValue(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

return $input.all().map((item, index) => {
  const payload = item.json;
  const email = stableValue(payload.lead?.email_normalized).toLowerCase();
  const phone = stableValue(payload.lead?.phone_normalized);
  const submissionReference = stableValue(payload.context?.submission_reference);
  const source = `${email}|${phone}|${submissionReference}`;
  const key = createHash('sha256').update(source, 'utf8').digest('hex');

  return {
    json: {
      ...payload,
      idempotency: {
        key,
      },
    },
    pairedItem: { item: index },
  };
});
