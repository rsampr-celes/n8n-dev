const normalizedInput = $('Normalize and Validate Lead').first().json;
const idempotencyResult = $input.first().json.idempotency;

return [{
  json: {
    ...normalizedInput,
    idempotency: idempotencyResult,
  },
}];
