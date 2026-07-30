import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const assetDirectory = path.resolve(testDirectory, '..');
const workflowsDirectory = path.join(assetDirectory, 'workflows');
const mainWorkflow = JSON.parse(fs.readFileSync(
  path.join(workflowsDirectory, 'ASSET001-website-lead-form.json'),
  'utf8',
));
const crmWorkflow = JSON.parse(fs.readFileSync(
  path.join(workflowsDirectory, 'ASSET001-hubspot-contact-deal.json'),
  'utf8',
));
const idempotencyWorkflow = JSON.parse(fs.readFileSync(
  path.join(workflowsDirectory, 'ASSET001-idempotency-guard.json'),
  'utf8',
));
const postmanCollection = JSON.parse(fs.readFileSync(
  path.join(
    assetDirectory,
    'postman',
    'ASSET001-lead-form.postman_collection.json',
  ),
  'utf8',
));

function findNode(workflow, name) {
  const node = workflow.nodes.find((candidate) => candidate.name === name);
  assert.ok(node, `${name} node is missing`);
  return node;
}

const buildDealRequest = new Function(
  '$input',
  '$',
  findNode(crmWorkflow, 'Build HubSpot Deal Request').parameters.jsCode,
);
const buildContactRequest = new Function(
  '$input',
  '$',
  findNode(crmWorkflow, 'Build HubSpot Contact Request').parameters.jsCode,
);
const evaluateDealSearch = new Function(
  '$input',
  '$',
  findNode(crmWorkflow, 'Evaluate Deal Search').parameters.jsCode,
);
const attachContactResponse = new Function(
  '$input',
  '$',
  findNode(crmWorkflow, 'Attach Contact Response').parameters.jsCode,
);
const attachDealResponse = new Function(
  '$input',
  '$',
  findNode(crmWorkflow, 'Attach Deal Response').parameters.jsCode,
);
const prepareResponse = new Function(
  '$input',
  '$',
  findNode(crmWorkflow, 'Prepare HubSpot CRM Response').parameters.jsCode,
);
const prepareReview = new Function(
  '$input',
  findNode(crmWorkflow, 'Prepare Deal Review').parameters.jsCode,
);
const bypassIdempotency = new Function(
  '$input',
  '$',
  findNode(idempotencyWorkflow, 'Bypass Idempotency').parameters.jsCode,
);

const lead = {
  first_name: 'Jane',
  last_name: 'Smith',
  email_normalized: 'jane@example.test',
  phone_normalized: '+15550102000',
  company: 'Northwind Services',
  service_requested: 'api_integration',
  message_sanitized: 'Connect our website leads with HubSpot.',
  consent: true,
};
const aiResponse = {
  service_category: 'api_integration',
  problem_summary: 'Website leads must synchronize with HubSpot.',
  urgency: 'high',
  confidence: 0.91,
  qualification_reason: 'Clear integration requirement and delivery timeline.',
};
const deterministicDecision = {
  final_score: 95,
  final_route: 'sales_qualified',
  route_reason: 'score_80_to_100',
};

function workflowContext(overrides = {}) {
  return {
    lead,
    crm_action: 'create',
    crm_match: {
      decision: 'create',
      contact_id: null,
    },
    ai_result: {
      ai_response: aiResponse,
      deterministic_decision: deterministicDecision,
    },
    correlation_id: 'd4ba95e6-9d6f-4d57-b836-40b5e125d17d',
    submission_reference:
      'ff2aa5825134022d89acdb8c1db98d8391e4ae8e156f5dcbe2afa146784d4763',
    received_at: '2026-07-30T12:00:00.000Z',
    source: 'portfolio_demo',
    hubspot_pipeline_id: 'default',
    hubspot_dealstage_id: 'appointmentscheduled',
    ...overrides,
  };
}

function executeDealBuild(context = workflowContext()) {
  return buildDealRequest(
    { all: () => [{ json: {} }] },
    (nodeName) => {
      assert.equal(nodeName, 'When Executed by Another Workflow');
      return { first: () => ({ json: context }) };
    },
  )[0].json;
}

function executeContactBuild(
  context = workflowContext(),
  dealDecision = {
    ...executeDealBuild(context),
    deal_match: { action: 'create', deal_id: null },
    should_write: true,
  },
) {
  return buildContactRequest(
    { first: () => ({ json: dealDecision }) },
    (nodeName) => {
      assert.equal(nodeName, 'When Executed by Another Workflow');
      return { first: () => ({ json: context }) };
    },
  )[0].json;
}

test('main flow invokes the HubSpot contact/deal child directly after AI', () => {
  const executeCrm = findNode(mainWorkflow, 'Execute HubSpot Contact Deal');

  assert.equal(
    mainWorkflow.connections['Execute AI Qualification'].main[0][0].node,
    'Execute HubSpot Contact Deal',
  );
  assert.equal(
    mainWorkflow.connections['Execute HubSpot Contact Deal'].main[0][0].node,
    'Continue Qualification',
  );
  assert.equal(executeCrm.parameters.workflowId.value, crmWorkflow.id);
  assert.deepEqual(
    Object.keys(executeCrm.parameters.workflowInputs.value),
    [
      'lead',
      'crm_action',
      'crm_match',
      'ai_result',
      'correlation_id',
      'submission_reference',
      'received_at',
      'source',
      'hubspot_pipeline_id',
      'hubspot_dealstage_id',
    ],
  );
  assert.match(
    executeCrm.parameters.workflowInputs.value.ai_result,
    /Execute AI Qualification/,
  );
  assert.match(
    executeCrm.parameters.workflowInputs.value.correlation_id,
    /stored_correlation_id/,
  );
});

test('child workflow exposes the same typed request contract as its parent call', () => {
  const trigger = findNode(crmWorkflow, 'When Executed by Another Workflow');
  const parentInputs = findNode(
    mainWorkflow,
    'Execute HubSpot Contact Deal',
  ).parameters.workflowInputs.schema;

  assert.equal(trigger.parameters.inputSource, 'workflowInputs');
  assert.deepEqual(
    trigger.parameters.workflowInputs.values,
    parentInputs.map(({ id, type }) => ({ name: id, type })),
  );
});

test('separate builders map contact and deal properties without a combined CRM request', () => {
  const dealResult = executeDealBuild();
  const contactResult = executeContactBuild();

  assert.deepEqual(contactResult.contact_request, {
    action: 'create',
    write_mode: 'upsert_by_email',
    contact_id: null,
    properties: {
      firstname: 'Jane',
      lastname: 'Smith',
      email: 'jane@example.test',
      phone: '+15550102000',
      company: 'Northwind Services',
      source: 'portfolio_demo',
      consent_status: 'true',
      consent_timestamp: '2026-07-30T12:00:00.000Z',
      last_enquiry_date: '2026-07-30T12:00:00.000Z',
    },
  });
  assert.deepEqual(dealResult.deal_request.create_properties, {
    dealname: 'Northwind Services - api_integration',
    service_category: 'api_integration',
    lead_score: '95',
    qualification_status: 'sales_qualified',
    urgency: 'high',
    problem_summary: 'Website leads must synchronize with HubSpot.',
    ai_confidence: '0.91',
    qualification_explanation:
      'Clear integration requirement and delivery timeline.',
    workflow_correlation_id:
      'd4ba95e6-9d6f-4d57-b836-40b5e125d17d',
    original_submission_reference:
      'ff2aa5825134022d89acdb8c1db98d8391e4ae8e156f5dcbe2afa146784d4763',
    pipeline: 'default',
    dealstage: 'appointmentscheduled',
  });
  assert.equal(
    Object.hasOwn(dealResult.deal_request.update_properties, 'pipeline'),
    false,
  );
  assert.deepEqual(
    dealResult.deal_request.search_request.filterGroups[0].filters[0],
    {
      propertyName: 'workflow_correlation_id',
      operator: 'EQ',
      value: 'd4ba95e6-9d6f-4d57-b836-40b5e125d17d',
    },
  );
  assert.deepEqual(Object.keys(dealResult), [
    'deal_request',
    'correlation_id',
  ]);
  assert.deepEqual(Object.keys(contactResult), [
    'contact_request',
    'deal_request',
    'deal_match',
    'correlation_id',
  ]);
  assert.equal(Object.hasOwn(dealResult, 'contact_request'), false);
  assert.equal(Object.hasOwn(contactResult, 'crm_request'), false);
});

test('update request requires and retains the matched contact ID', () => {
  const result = executeContactBuild(workflowContext({
    crm_action: 'update',
    crm_match: {
      decision: 'update',
      matched_by: 'phone',
      contact_id: '420574139611',
    },
    lead: {
      ...lead,
      phone_normalized: null,
      company: null,
    },
  }));

  assert.equal(result.contact_request.action, 'update');
  assert.equal(result.contact_request.write_mode, 'update_by_id');
  assert.equal(result.contact_request.contact_id, '420574139611');
  assert.equal(Object.hasOwn(result.contact_request.properties, 'phone'), false);
  assert.equal(Object.hasOwn(result.contact_request.properties, 'company'), false);
});

test('email-matched updates use the prebuilt HubSpot contact upsert', () => {
  const result = executeContactBuild(workflowContext({
    crm_action: 'update',
    crm_match: {
      decision: 'update',
      matched_by: 'email',
      contact_id: '420574139611',
    },
  }));

  assert.equal(result.contact_request.action, 'update');
  assert.equal(result.contact_request.write_mode, 'upsert_by_email');
  assert.equal(
    crmWorkflow.connections['Use Contact Upsert?'].main[0][0].node,
    'Upsert HubSpot Contact',
  );
  assert.equal(
    crmWorkflow.connections['Use Contact Upsert?'].main[1][0].node,
    'Update HubSpot Contact',
  );
});

test('invalid AI output still produces a human-review CRM request', () => {
  const result = executeDealBuild(workflowContext({
    ai_result: {
      review_outcome: {
        final_score: null,
        final_route: 'human_review',
        route_reason: 'invalid_ai_response',
      },
    },
  }));

  assert.equal(result.deal_request.create_properties.qualification_status, 'human_review');
  assert.equal(result.deal_request.create_properties.urgency, 'unknown');
  assert.equal(result.deal_request.create_properties.ai_confidence, '0');
  assert.equal(
    result.deal_request.create_properties.problem_summary,
    lead.message_sanitized,
  );
  assert.equal(
    Object.hasOwn(result.deal_request.create_properties, 'lead_score'),
    false,
  );
});

test('deal search produces create, update, and review decisions', () => {
  const dealRequest = executeDealBuild();
  const run = (results) => evaluateDealSearch(
    { all: () => results.map((result) => ({ json: result })) },
    (nodeName) => {
      assert.equal(nodeName, 'Build HubSpot Deal Request');
      return { first: () => ({ json: dealRequest }) };
    },
  )[0].json;

  assert.equal(run([]).deal_match.action, 'create');
  assert.deepEqual(run([{ id: '10' }]).deal_match, {
    action: 'update',
    deal_id: '10',
    match_count: 1,
    candidate_deal_ids: ['10'],
    review_reason: null,
  });
  const ambiguous = run([{ id: '10' }, { id: '11' }]);
  assert.equal(ambiguous.should_write, false);
  assert.equal(
    ambiguous.deal_match.review_reason,
    'multiple_deals_for_correlation_id',
  );
});

test('response handlers preserve only IDs, actions, and correlation data', () => {
  const dealRequest = executeDealBuild();
  const decision = {
    ...dealRequest,
    deal_match: {
      action: 'create',
      deal_id: null,
    },
    should_write: true,
  };
  const requestContext = executeContactBuild(workflowContext(), decision);
  const contact = attachContactResponse(
    { first: () => ({ json: { vid: '20', properties: { email: 'x' } } }) },
    (nodeName) => {
      assert.equal(nodeName, 'Build HubSpot Contact Request');
      return { first: () => ({ json: requestContext }) };
    },
  )[0].json;
  const deal = attachDealResponse(
    {
      first: () => ({
        json: { dealId: '30', properties: { dealname: 'x' } },
      }),
    },
    (nodeName) => {
      assert.equal(nodeName, 'Attach Contact Response');
      return { first: () => ({ json: contact }) };
    },
  )[0].json;
  const response = prepareResponse(
    { first: () => ({ json: { associationTypeId: 3 } }) },
    (nodeName) => {
      assert.equal(nodeName, 'Attach Deal Response');
      return { first: () => ({ json: deal }) };
    },
  )[0].json;

  assert.deepEqual(response, {
    hubspot_write_success: true,
    correlation_id: dealRequest.correlation_id,
    contact: {
      action: 'create',
      contact_id: '20',
    },
    deal: {
      action: 'create',
      deal_id: '30',
      associated_contact_id: '20',
    },
  });
});

test('ambiguous deals return review without entering contact writes', () => {
  const response = prepareReview({
    first: () => ({
      json: {
        correlation_id: 'correlation-1',
        deal_match: {
          candidate_deal_ids: ['30', '31'],
          review_reason: 'multiple_deals_for_correlation_id',
        },
      },
    }),
  })[0].json;

  assert.equal(
    crmWorkflow.connections['Can Write CRM?'].main[1][0].node,
    'Prepare Deal Review',
  );
  assert.deepEqual(response, {
    hubspot_write_success: false,
    correlation_id: 'correlation-1',
    contact: null,
    deal: {
      action: 'review',
      deal_id: null,
      candidate_deal_ids: ['30', '31'],
      review_reason: 'multiple_deals_for_correlation_id',
    },
  });
});

test('prebuilt HubSpot nodes are used wherever they preserve safe behavior', () => {
  const hubspotNodes = crmWorkflow.nodes.filter(
    (node) => node.type === 'n8n-nodes-base.hubspot',
  );
  const requestNodes = crmWorkflow.nodes.filter(
    (node) => node.type === 'n8n-nodes-base.httpRequest',
  );

  assert.deepEqual(
    hubspotNodes.map((node) => node.name),
    [
      'Search Existing Deal',
      'Upsert HubSpot Contact',
      'Create HubSpot Deal',
      'Update HubSpot Deal',
    ],
  );
  assert.deepEqual(
    requestNodes.map((node) => node.name),
    [
      'Update HubSpot Contact',
      'Associate Contact and Deal',
    ],
  );
  for (const node of [...hubspotNodes, ...requestNodes]) {
    assert.deepEqual(node.credentials.hubspotAppToken, {
      id: 'gNSXBziHeO44pSta',
      name: 'HubspotConnectionSK',
    });
    assert.equal(node.retryOnFail, true);
    assert.equal(node.maxTries, 3);
    assert.equal(node.waitBetweenTries, 30000);
  }
  for (const node of hubspotNodes) {
    assert.equal(node.parameters.authentication, 'appToken');
  }
  for (const node of requestNodes) {
    assert.equal(node.parameters.authentication, 'predefinedCredentialType');
    assert.equal(node.parameters.nodeCredentialType, 'hubspotAppToken');
  }
  assert.equal(
    findNode(crmWorkflow, 'Search Existing Deal')
      .parameters.filterGroupsUi.filterGroupsValues[0]
      .filtersUi.filterValues[0].propertyName,
    'workflow_correlation_id|string',
  );
  assert.equal(
    findNode(crmWorkflow, 'Create HubSpot Deal')
      .parameters.additionalFields.associatedVids,
    '={{ [$json.contact_result.contact_id] }}',
  );
  assert.equal(
    crmWorkflow.connections['Associate Existing Deal?'].main[1][0].node,
    'Prepare HubSpot CRM Response',
  );
  assert.match(
    findNode(crmWorkflow, 'Associate Contact and Deal').parameters.url,
    /associations\/default\/contacts/,
  );
});

test('idempotency bypass retains the generated correlation ID', () => {
  const result = bypassIdempotency(
    {
      all: () => [{
        json: {
          correlation_id: 'd4ba95e6-9d6f-4d57-b836-40b5e125d17d',
        },
      }],
    },
    (nodeName) => {
      assert.equal(nodeName, 'When Executed by Another Workflow');
      return { first: () => ({ json: { lead } }) };
    },
  )[0].json;

  assert.equal(
    result.idempotency.stored_correlation_id,
    'd4ba95e6-9d6f-4d57-b836-40b5e125d17d',
  );
});

test('synthetic Postman contacts use a HubSpot-compatible email domain', () => {
  const serializedCollection = JSON.stringify(postmanCollection);
  const emailVariable = postmanCollection.variable.find(
    (variable) => variable.key === 'idempotencyEmail',
  );
  const formPathVariable = postmanCollection.variable.find(
    (variable) => variable.key === 'formPath',
  );
  const formTrigger = findNode(mainWorkflow, 'Website Lead Form');
  const emailField = formTrigger.parameters.formFields.values.find(
    (field) => field.fieldLabel === 'Work email',
  );

  assert.equal(emailVariable.value, 'postman.idempotency@example.com');
  assert.match(serializedCollection, /@example\.com/);
  assert.doesNotMatch(serializedCollection, /@example\.test/i);
  assert.equal(formPathVariable.value, 'form/asset001-lead-qualification');
  assert.equal(
    postmanCollection.variable.some(
      (variable) => variable.key === 'resolvedBaseUrl',
    ),
    false,
  );
  for (const item of postmanCollection.item) {
    assert.equal(item.request.url.raw, '{{baseUrl}}/{{formPath}}');
  }
  assert.equal(emailField.placeholder, 'jane@example.com');
});
