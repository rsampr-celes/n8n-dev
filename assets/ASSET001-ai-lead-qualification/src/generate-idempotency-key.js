const { createHash } = require('crypto');

function stableValue(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

return $input.all().map((item, index) => {
  const payload = item.json;
  const email = stableValue(payload.email_normalized).toLowerCase();
  const phone = stableValue(payload.phone_normalized);
  const submissionReference = stableValue(payload.submission_reference);
  const source = `${email}|${phone}|${submissionReference}`;
  const key = createHash('sha256').update(source, 'utf8').digest('hex');

  return {
    json: {
      correlation_id: payload.correlation_id,
      idempotency_key: key,
    },
    pairedItem: { item: index },
  };
});
