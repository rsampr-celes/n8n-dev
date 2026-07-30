import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const assetDirectory = path.resolve(testDirectory, '..');
const workflow = JSON.parse(
  fs.readFileSync(
    path.join(assetDirectory, 'workflows', 'ASSET001-hubspot-contact-match.json'),
    'utf8',
  ),
);
const mainWorkflow = JSON.parse(
  fs.readFileSync(
    path.join(assetDirectory, 'workflows', 'ASSET001-website-lead-form.json'),
    'utf8',
  ),
);

function findNode(name) {
  const node = workflow.nodes.find((candidate) => candidate.name === name);
  assert.ok(node, `${name} node is missing`);
  return node;
}

const evaluateEmail = new Function(
  '$input',
  '$',
  findNode('Evaluate Email Results').parameters.jsCode,
);
const evaluatePhone = new Function(
  '$input',
  '$',
  findNode('Evaluate Phone Results').parameters.jsCode,
);
const produceDecision = new Function(
  '$input',
  findNode('Produce Match Decision').parameters.jsCode,
);

const normalizedInput = {
  lead: {
    email_normalized: 'jane@example.test',
    phone_normalized: '+15550102000',
    company: 'Northwind Services',
  },
};

function items(ids) {
  return ids.length === 0
    ? [{ json: {} }]
    : ids.map((id) => ({ json: { id, properties: {} } }));
}

function nodeLookup(values) {
  return (name) => {
    assert.ok(Object.hasOwn(values, name), `Unexpected node lookup: ${name}`);
    return { first: () => ({ json: values[name] }) };
  };
}

function runEmail(ids, input = normalizedInput) {
  return evaluateEmail(
    { all: () => items(ids) },
    nodeLookup({ 'When Executed by Another Workflow': input }),
  )[0].json;
}

function runPhone(ids, emailEvaluation) {
  return evaluatePhone(
    { all: () => items(ids) },
    nodeLookup({ 'Evaluate Email Results': emailEvaluation }),
  )[0].json;
}

function finalize(evaluation) {
  return produceDecision({ all: () => [{ json: evaluation }] })[0].json;
}

test('workflow contains only matching, routing, and decision nodes', () => {
  assert.deepEqual(
    workflow.nodes.map((node) => node.name),
    [
      'When Executed by Another Workflow',
      'Search HubSpot by Email',
      'Evaluate Email Results',
      'Search by Phone?',
      'Search HubSpot by Phone',
      'Evaluate Phone Results',
      'Produce Match Decision',
    ],
  );
  assert.equal(
    workflow.nodes.some((node) => /audit|validate|error handler/i.test(node.name)),
    false,
  );
});

test('main workflow calls contact matching after a new idempotency claim', () => {
  const gateNode = mainWorkflow.nodes.find(
    (node) => node.name === 'Wait for Idempotency',
  );
  const executeNode = mainWorkflow.nodes.find(
    (node) => node.name === 'Execute HubSpot Contact Match',
  );

  assert.ok(gateNode);
  assert.ok(executeNode);
  assert.equal(
    mainWorkflow.connections['Is Lead Valid?'].main[0][0].node,
    'Use Normalized Input',
  );
  assert.equal(
    mainWorkflow.connections['Use Normalized Input'].main[0][0].node,
    'Execute Idempotency Guard',
  );
  assert.equal(
    mainWorkflow.connections['Use Normalized Input'].main[0][1].node,
    'Wait for Idempotency',
  );
  assert.equal(
    mainWorkflow.connections['Use Normalized Input'].main[0][1].index,
    0,
  );
  assert.equal(
    mainWorkflow.connections['Continue After Idempotency?'].main[0][0].node,
    'Wait for Idempotency',
  );
  assert.equal(
    mainWorkflow.connections['Continue After Idempotency?'].main[0][0].index,
    1,
  );
  assert.equal(
    mainWorkflow.connections['Wait for Idempotency'].main[0][0].node,
    'Execute HubSpot Contact Match',
  );
  assert.equal(
    executeNode.parameters.workflowId.value,
    workflow.id,
  );
});

test('idempotency gate outputs the original normalized branch unchanged', () => {
  const gateNode = mainWorkflow.nodes.find(
    (node) => node.name === 'Wait for Idempotency',
  );

  assert.deepEqual(gateNode.parameters, {
    mode: 'chooseBranch',
    numberInputs: 2,
    chooseBranchMode: 'waitForAll',
    output: 'specifiedInput',
    useDataOfInput: 1,
  });
  assert.equal(
    mainWorkflow.nodes.some(
      (node) => node.name === 'Prepare HubSpot Match Input',
    ),
    false,
  );
});

test('HubSpot searches use exact filters and stop after two results', () => {
  const emailNode = findNode('Search HubSpot by Email');
  const phoneNode = findNode('Search HubSpot by Phone');
  const emailFilter =
    emailNode.parameters.filterGroupsUi.filterGroupsValues[0]
      .filtersUi.filterValues[0];
  const phoneFilter =
    phoneNode.parameters.filterGroupsUi.filterGroupsValues[0]
      .filtersUi.filterValues[0];

  assert.equal(emailNode.parameters.limit, 2);
  assert.equal(phoneNode.parameters.limit, 2);
  assert.deepEqual(
    [emailFilter.propertyName, emailFilter.operator],
    ['email|string', 'EQ'],
  );
  assert.deepEqual(
    [phoneFilter.propertyName, phoneFilter.operator],
    ['phone|string', 'EQ'],
  );
  assert.deepEqual(emailNode.credentials.hubspotAppToken, {
    id: 'gNSXBziHeO44pSta',
    name: 'HubspotConnectionSK',
  });
  assert.deepEqual(phoneNode.credentials.hubspotAppToken, {
    id: 'gNSXBziHeO44pSta',
    name: 'HubspotConnectionSK',
  });
  assert.equal(emailNode.alwaysOutputData, true);
  assert.equal(phoneNode.alwaysOutputData, true);
});

test('one email match returns update without a phone search', () => {
  const evaluation = runEmail(['101']);
  assert.equal(evaluation.next_step, 'decide');
  assert.deepEqual(finalize(evaluation).crm_match, {
    decision: 'update',
    status: 'matched',
    matched_by: 'email',
    contact_id: '101',
    match_count: 1,
    candidate_contact_ids: ['101'],
    review_reason: null,
  });
});

test('multiple email matches return review without a phone search', () => {
  const evaluation = runEmail(['101', '102']);
  assert.equal(evaluation.next_step, 'decide');
  assert.equal(evaluation.match.decision, 'review');
  assert.equal(evaluation.match.review_reason, 'multiple_email_matches');
  assert.deepEqual(evaluation.match.candidate_contact_ids, ['101', '102']);
});

test('zero email matches with a phone requests the phone search', () => {
  const evaluation = runEmail([]);
  assert.equal(evaluation.next_step, 'search_phone');
  assert.equal(evaluation.match, null);
});

test('zero email matches without a phone returns create', () => {
  const input = structuredClone(normalizedInput);
  input.lead.phone_normalized = null;
  const evaluation = runEmail([], input);
  assert.equal(evaluation.next_step, 'decide');
  assert.equal(finalize(evaluation).crm_match.decision, 'create');
});

test('one phone match returns update matched by phone', () => {
  const emailEvaluation = runEmail([]);
  const evaluation = runPhone(['201'], emailEvaluation);
  assert.deepEqual(finalize(evaluation).crm_match, {
    decision: 'update',
    status: 'matched',
    matched_by: 'phone',
    contact_id: '201',
    match_count: 1,
    candidate_contact_ids: ['201'],
    review_reason: null,
  });
});

test('multiple phone matches return review', () => {
  const evaluation = runPhone(['201', '202'], runEmail([]));
  assert.equal(evaluation.match.decision, 'review');
  assert.equal(evaluation.match.review_reason, 'multiple_phone_matches');
});

test('zero email and phone matches return only the create decision', () => {
  const evaluation = runPhone([], runEmail([]));
  const result = finalize(evaluation);

  assert.deepEqual(result, {
    hubspot_search_success: true,
    crm_action: 'create',
    crm_match: {
      decision: 'create',
      status: 'not_found',
      matched_by: null,
      contact_id: null,
      match_count: 0,
      candidate_contact_ids: [],
      review_reason: null,
    },
  });
});
