import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const require = createRequire(import.meta.url);
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const assetDirectory = path.resolve(testDirectory, '..');
const workflow = JSON.parse(
  fs.readFileSync(path.join(assetDirectory, 'workflows', 'ASSET001-website-lead-form.json'), 'utf8'),
);
const leadSchema = JSON.parse(
  fs.readFileSync(path.join(assetDirectory, 'schemas', 'lead-submission.schema.json'), 'utf8'),
);
const errorSchema = JSON.parse(
  fs.readFileSync(path.join(assetDirectory, 'schemas', 'validation-error.schema.json'), 'utf8'),
);
const validInput = JSON.parse(
  fs.readFileSync(path.join(assetDirectory, 'examples', 'valid-lead.json'), 'utf8'),
);

const codeNode = workflow.nodes.find((node) => node.name === 'Normalize and Validate Lead');
assert.ok(codeNode, 'Normalize and Validate Lead node is missing');
const executeCodeNode = new Function('require', '$input', codeNode.parameters.jsCode);
const runtimeRequire = (specifier) => require(
  specifier
    .replace(/^asset001-ajv\//, 'ajv/')
    .replace(/^asset001-ajv-formats\//, 'ajv-formats/'),
);

const schemaAjv = new Ajv({ allErrors: true, strict: true });
addFormats(schemaAjv);
const validateCanonicalLead = schemaAjv.compile(leadSchema);
const validateError = schemaAjv.compile(errorSchema);

function clone(value) {
  return structuredClone(value);
}

function run(raw) {
  const output = executeCodeNode(runtimeRequire, { all: () => [{ json: raw }] });
  assert.equal(output.length, 1);
  for (const error of output[0].json.validation.errors) {
    assert.equal(validateError(error), true, JSON.stringify(validateError.errors));
  }
  return output[0].json;
}

function codes(result) {
  return result.validation.errors.map((error) => error.code);
}

test('V01 complete valid lead is normalized and valid', () => {
  const result = run(clone(validInput));
  assert.equal(result.validation.is_valid, true);
  assert.deepEqual(result.validation.errors, []);
  assert.equal(result.lead.full_name, 'Jane Smith');
  assert.equal(result.lead.email_normalized, 'jane@example.test');
  assert.equal(result.lead.phone_normalized, '+15550102000');
  assert.equal(result.lead.company_website, 'https://example.test/services');
  assert.equal(result.context.schema_version, '1.0.0');
});

test('V02 missing full name returns required', () => {
  const input = clone(validInput);
  delete input.full_name;
  assert.ok(codes(run(input)).includes('required'));
});

test('V03 blank full name returns required', () => {
  const input = clone(validInput);
  input.full_name = '   ';
  assert.ok(codes(run(input)).includes('required'));
});

test('V04 invalid email returns invalid_format', () => {
  const input = clone(validInput);
  input.email = 'not-an-email';
  assert.ok(codes(run(input)).includes('invalid_format'));
});

test('V05 email longer than 254 returns max_length', () => {
  const input = clone(validInput);
  input.email = `${'a'.repeat(250)}@x.test`;
  assert.ok(codes(run(input)).includes('max_length'));
});

test('V06 missing consent returns consent_required', () => {
  const input = clone(validInput);
  delete input.consent;
  assert.ok(codes(run(input)).includes('consent_required'));
});

test('V07 unchecked consent returns consent_required', () => {
  const input = clone(validInput);
  input.consent = [];
  assert.ok(codes(run(input)).includes('consent_required'));
});

test('V08 invalid phone returns invalid_format', () => {
  const input = clone(validInput);
  input.phone = '555-0100';
  assert.ok(codes(run(input)).includes('invalid_format'));
});

test('V09 valid E.164 phone is valid', () => {
  const input = clone(validInput);
  input.phone = '+442071838750';
  assert.equal(run(input).validation.is_valid, true);
});

test('V10 invalid website returns invalid_format', () => {
  const input = clone(validInput);
  input.company_website = 'https://exa mple.test';
  assert.ok(codes(run(input)).includes('invalid_format'));
});

test('V11 non-HTTP website returns invalid_format', () => {
  const input = clone(validInput);
  input.company_website = 'ftp://example.test/file';
  assert.ok(codes(run(input)).includes('invalid_format'));
});

test('V12 unknown service returns invalid_enum', () => {
  const input = clone(validInput);
  input.service_requested = 'Unknown service';
  assert.ok(codes(run(input)).includes('invalid_enum'));
});

test('V13 unknown budget returns invalid_enum', () => {
  const input = clone(validInput);
  input.budget = 'Unlimited';
  assert.ok(codes(run(input)).includes('invalid_enum'));
});

test('V14 unknown timeline returns invalid_enum', () => {
  const input = clone(validInput);
  input.timeline = 'Yesterday';
  assert.ok(codes(run(input)).includes('invalid_enum'));
});

test('V15 missing message returns required', () => {
  const input = clone(validInput);
  delete input.message;
  assert.ok(codes(run(input)).includes('required'));
});

test('V16 message longer than 5000 returns max_length', () => {
  const input = clone(validInput);
  input.message = 'x'.repeat(5001);
  assert.ok(codes(run(input)).includes('max_length'));
});

test('V17 blank optional fields become null and remain valid', () => {
  const input = clone(validInput);
  for (const field of [
    'phone',
    'company',
    'company_website',
    'service_requested',
    'budget',
    'timeline',
    'country',
  ]) {
    input[field] = ' ';
  }
  const result = run(input);
  assert.equal(result.validation.is_valid, true);
  assert.equal(result.lead.phone_normalized, null);
  assert.equal(result.lead.company, null);
  assert.equal(result.lead.company_website, null);
  assert.equal(result.lead.service_requested, null);
  assert.equal(result.lead.budget_band, null);
  assert.equal(result.lead.timeline_band, null);
  assert.equal(result.lead.country, null);
});

test('V18 multiple invalid fields return all errors', () => {
  const result = run({
    full_name: ' ',
    email: 'invalid',
    phone: '123',
    message: ' ',
    consent: [],
  });
  assert.equal(result.validation.is_valid, false);
  assert.ok(result.validation.errors.length >= 5);
});

test('V19 canonical schema rejects an extra property', () => {
  const canonical = run(clone(validInput)).lead;
  canonical.unexpected = 'value';
  assert.equal(validateCanonicalLead(canonical), false);
  assert.ok(validateCanonicalLead.errors.some((error) => error.keyword === 'additionalProperties'));
});

test('V20 unsafe control characters are removed from message', () => {
  const input = clone(validInput);
  input.message = 'Line one\u0000\r\nLine two\u0007';
  const result = run(input);
  assert.equal(result.validation.is_valid, true);
  assert.equal(result.lead.message_sanitized, 'Line one\nLine two');
});

test('operational errors never copy submitted values', () => {
  const sensitiveValue = 'DO_NOT_LEAK_7f63';
  const input = clone(validInput);
  input.email = sensitiveValue;
  const serializedErrors = JSON.stringify(run(input).validation.errors);
  assert.equal(serializedErrors.includes(sensitiveValue), false);
});
