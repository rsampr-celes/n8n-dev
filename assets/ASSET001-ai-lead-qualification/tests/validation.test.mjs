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
const idempotencyWorkflow = JSON.parse(
  fs.readFileSync(path.join(assetDirectory, 'workflows', 'ASSET001-idempotency-guard.json'), 'utf8'),
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
const idempotencyNode = idempotencyWorkflow.nodes.find(
  (node) => node.name === 'Generate Idempotency Key',
);
assert.ok(idempotencyNode, 'Generate Idempotency Key node is missing');
const executeIdempotencyNode = new Function(
  'require',
  '$input',
  idempotencyNode.parameters.jsCode,
);
const finalizeIdempotencyNode = idempotencyWorkflow.nodes.find(
  (node) => node.name === 'Finalize Idempotency Result',
);
assert.ok(finalizeIdempotencyNode, 'Finalize Idempotency Result node is missing');
const executeFinalizeIdempotencyNode = new Function(
  '$input',
  finalizeIdempotencyNode.parameters.jsCode,
);
const bypassIdempotencyNode = idempotencyWorkflow.nodes.find(
  (node) => node.name === 'Bypass Idempotency',
);
assert.ok(bypassIdempotencyNode, 'Bypass Idempotency node is missing');
const executeBypassIdempotencyNode = new Function(
  '$input',
  bypassIdempotencyNode.parameters.jsCode,
);
const applyIdempotencyConfigNode = idempotencyWorkflow.nodes.find(
  (node) => node.name === 'Apply Idempotency Configuration',
);
assert.ok(applyIdempotencyConfigNode, 'Apply Idempotency Configuration node is missing');
const executeApplyIdempotencyConfigNode = new Function(
  '$input',
  '$',
  applyIdempotencyConfigNode.parameters.jsCode,
);
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

function generateIdempotencyKey(payload) {
  return executeIdempotencyNode(runtimeRequire, {
    all: () => [{ json: payload }],
  })[0].json;
}

function applyIdempotencyConfig(configRow, payload) {
  return executeApplyIdempotencyConfigNode(
    { first: () => ({ json: configRow }) },
    (nodeName) => {
      assert.equal(nodeName, 'When Executed by Another Workflow');
      return { first: () => ({ json: payload }) };
    },
  )[0].json;
}

test('form exposes separate required first-name and last-name fields', () => {
  const formNode = workflow.nodes.find((node) => node.name === 'Website Lead Form');
  const fields = formNode.parameters.formFields.values;

  assert.deepEqual(
    fields.slice(0, 2).map(({ fieldName, fieldLabel, requiredField }) => ({
      fieldName,
      fieldLabel,
      requiredField,
    })),
    [
      { fieldName: 'first_name', fieldLabel: 'First name', requiredField: true },
      { fieldName: 'last_name', fieldLabel: 'Last name', requiredField: true },
    ],
  );
  assert.equal(fields.some((field) => field.fieldName === 'full_name'), false);
});

test('V01 complete valid lead is normalized and valid', () => {
  const result = run(clone(validInput));
  assert.equal(result.validation.is_valid, true);
  assert.deepEqual(result.validation.errors, []);
  assert.equal(result.lead.first_name, 'Jane');
  assert.equal(result.lead.last_name, 'Smith');
  assert.equal(result.lead.email_normalized, 'jane@example.test');
  assert.equal(result.lead.phone_normalized, '+15550102000');
  assert.equal(result.lead.company_website, 'https://example.test/services');
  assert.equal(result.context.schema_version, '2.0.0');
});

test('V02 missing first name returns required', () => {
  const input = clone(validInput);
  delete input.first_name;
  assert.ok(codes(run(input)).includes('required'));
});

test('V03 blank last name returns required', () => {
  const input = clone(validInput);
  input.last_name = '   ';
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
    first_name: ' ',
    last_name: ' ',
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

test('I01 idempotency key uses the documented normalized source', () => {
  const normalized = run({
    ...clone(validInput),
    submission_reference: ' FORM-001 ',
  });
  const configured = applyIdempotencyConfig({
    key: 'idempotency_enabled',
    enabled: true,
  }, normalized);
  const result = generateIdempotencyKey(configured);

  assert.equal(
    result.idempotency_key,
    '5c50517d4589f9e8d0c00f123b7b5f38860c8e7ef521dd63ab08fe6ccfd4666e',
  );
});

test('I02 repeated normalized submission produces the same key', () => {
  const first = generateIdempotencyKey(
    applyIdempotencyConfig({}, run(clone(validInput))),
  );
  const second = generateIdempotencyKey(
    applyIdempotencyConfig({}, run(clone(validInput))),
  );

  assert.equal(first.idempotency_key, second.idempotency_key);
  assert.match(first.idempotency_key, /^[0-9a-f]{64}$/);
});

test('I03 submission reference separates otherwise identical submissions', () => {
  const first = run({ ...clone(validInput), submission_reference: 'FORM-001' });
  const second = run({ ...clone(validInput), submission_reference: 'FORM-002' });

  assert.notEqual(
    generateIdempotencyKey(applyIdempotencyConfig({}, first)).idempotency_key,
    generateIdempotencyKey(applyIdempotencyConfig({}, second)).idempotency_key,
  );
});

test('I04 claim happens before qualification and handles every stored state', () => {
  const claimNode = idempotencyWorkflow.nodes.find(
    (node) => node.name === 'Claim Idempotency Key',
  );
  assert.ok(claimNode);
  assert.match(claimNode.parameters.query, /ON CONFLICT \(idempotency_key\)/);
  assert.match(claimNode.parameters.query, /CASE WHEN xmax = 0 THEN 'claimed'/);
  assert.doesNotMatch(claimNode.parameters.query, /workflow_payload/);
  assert.equal(
    idempotencyWorkflow.nodes.some((node) => node.name === 'Restore Idempotency Context'),
    false,
  );

  assert.equal(
    workflow.nodes.some((node) => node.type === 'n8n-nodes-base.postgres'),
    false,
  );
  assert.equal(
    workflow.nodes.some((node) => node.name === 'Generate Idempotency Key'),
    false,
  );
  assert.ok(workflow.nodes.some((node) => node.name === 'Execute Idempotency Guard'));
  assert.equal(
    workflow.nodes.some((node) => node.name === 'Prepare Idempotency Request'),
    false,
  );
  assert.equal(
    workflow.connections['Is Lead Valid?'].main[0][0].node,
    'Execute Idempotency Guard',
  );
  assert.equal(idempotencyWorkflow.settings.callerPolicy, 'workflowsFromAList');
  assert.equal(idempotencyWorkflow.settings.callerIds, workflow.id);
});

test('I05 Data Table configuration is contained in the sub-workflow', () => {
  const configurationNode = idempotencyWorkflow.nodes.find(
    (node) => node.name === 'Read Idempotency Configuration',
  );
  assert.equal(configurationNode.type, 'n8n-nodes-base.dataTable');
  assert.deepEqual(configurationNode.parameters.dataTableId, {
    __rl: true,
    value: 'asset001_runtime_config',
    mode: 'name',
  });
  assert.equal(configurationNode.parameters.filters.conditions[0].keyName, 'key');
  assert.equal(
    configurationNode.parameters.filters.conditions[0].keyValue,
    'idempotency_enabled',
  );
  assert.equal(configurationNode.alwaysOutputData, true);
  assert.equal(
    workflow.nodes.some((node) => node.type === 'n8n-nodes-base.dataTable'),
    false,
  );
  assert.equal(
    idempotencyWorkflow.connections['Is Idempotency Enabled?'].main[0][0].node,
    'Generate Idempotency Key',
  );
  assert.equal(
    idempotencyWorkflow.connections['Is Idempotency Enabled?'].main[1][0].node,
    'Bypass Idempotency',
  );
});

test('I06 Data Table false bypasses idempotency and continues', () => {
  const payload = run(clone(validInput));
  const configured = applyIdempotencyConfig({
    key: 'idempotency_enabled',
    enabled: false,
  }, payload);
  const result = executeBypassIdempotencyNode({
    all: () => [{ json: configured }],
  })[0].json;

  assert.equal(configured.idempotency_enabled, false);
  assert.deepEqual(result.idempotency, {
    enabled: false,
    key: null,
    claim_action: 'bypassed',
    should_continue: true,
    outcome: 'continue',
  });
});

test('I07 missing Data Table row fails safe with idempotency enabled', () => {
  const payload = run(clone(validInput));
  const configured = applyIdempotencyConfig({}, payload);

  assert.equal(configured.idempotency_enabled, true);
});

test('I08 sub-workflow maps every stored state to a parent decision', () => {
  const routeNode = idempotencyWorkflow.nodes.find(
    (node) => node.name === 'Route Claim Action',
  );
  assert.ok(routeNode);
  assert.deepEqual(
    routeNode.parameters.rules.values.map((rule) => rule.outputKey),
    ['claimed', 'completed', 'processing', 'failed'],
  );
  assert.equal(
    idempotencyWorkflow.connections['Claim Idempotency Key'].main[0][0].node,
    'Route Claim Action',
  );
  assert.equal(
    idempotencyWorkflow.connections['Route Claim Action'].main.length,
    4,
  );

  const expected = {
    claimed: [true, 'continue'],
    completed: [false, 'return_previous_result'],
    processing: [false, 'accepted_in_progress'],
    failed: [false, 'authorized_safe_replay_required'],
  };

  for (const [claimAction, [shouldContinue, outcome]] of Object.entries(expected)) {
    const result = executeFinalizeIdempotencyNode({
      all: () => [{
        json: {
          idempotency_key: 'a'.repeat(64),
          claim_action: claimAction,
          stored_correlation_id: 'b2701e45-4d60-4e2f-a115-175c4d0582a4',
          stored_status: claimAction === 'claimed' ? 'processing' : claimAction,
          previous_result: null,
          previous_error: null,
        },
      }],
    })[0].json;

    assert.equal(result.idempotency.enabled, true);
    assert.equal(result.idempotency.should_continue, shouldContinue);
    assert.equal(result.idempotency.outcome, outcome);
  }
});

test('I09 each idempotency stage emits only its explicit contract', () => {
  const normalized = run({
    ...clone(validInput),
    submission_reference: 'FORM-001',
  });

  const configured = applyIdempotencyConfig({
    key: 'idempotency_enabled',
    enabled: true,
  }, normalized);
  assert.deepEqual(Object.keys(configured).sort(), [
    'correlation_id',
    'email_normalized',
    'idempotency_enabled',
    'phone_normalized',
    'submission_reference',
  ]);

  const keyed = generateIdempotencyKey(configured);
  assert.deepEqual(Object.keys(keyed).sort(), [
    'correlation_id',
    'idempotency_key',
  ]);

  const finalized = executeFinalizeIdempotencyNode({
    all: () => [{
      json: {
        claim_action: 'claimed',
        idempotency_key: keyed.idempotency_key,
        stored_correlation_id: keyed.correlation_id,
        stored_status: 'processing',
        previous_result: null,
        previous_error: null,
      },
    }],
  })[0].json;
  assert.deepEqual(Object.keys(finalized), ['idempotency']);
});
