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
const aiWorkflow = JSON.parse(fs.readFileSync(
  path.join(workflowsDirectory, 'ASSET001-ai-qualification.json'),
  'utf8',
));
const canonicalAiResponseSchema = JSON.parse(fs.readFileSync(
  path.join(assetDirectory, 'schemas', 'ai-qualification-response.schema.json'),
  'utf8',
));

function findNode(workflow, name) {
  const node = workflow.nodes.find((candidate) => candidate.name === name);
  assert.ok(node, `${name} node is missing`);
  return node;
}

const determineAiInvocation = new Function(
  '$input',
  findNode(mainWorkflow, 'Determine AI Invocation').parameters.jsCode,
);
const buildAiRequest = new Function(
  '$input',
  findNode(aiWorkflow, 'Build AI Request').parameters.jsCode,
);
const attachAiProviderResponse = new Function(
  '$input',
  findNode(aiWorkflow, 'Attach AI Provider Response').parameters.jsCode,
);
const validateAiResponse = new Function(
  '$input',
  findNode(aiWorkflow, 'Validate AI Response').parameters.jsCode,
);
const calculateDeterministicScore = new Function(
  '$input',
  '$',
  findNode(aiWorkflow, 'Calculate Deterministic Score').parameters.jsCode,
);
const prepareAiReviewOutcome = new Function(
  '$input',
  '$',
  findNode(aiWorkflow, 'Prepare AI Review Outcome').parameters.jsCode,
);

const lead = {
  first_name: 'Jane',
  last_name: 'Smith',
  email_normalized: 'jane@example.test',
  phone_normalized: '+15550102000',
  company: 'Northwind Services',
  company_description: 'B2B service company',
  service_requested: 'api_integration',
  message_sanitized: 'Connect our website leads with HubSpot.',
  budget_band: '5000_10000',
  timeline_band: 'within_one_month',
  consent: true,
};

const expectedAiResponse = {
  service_category: 'api_integration',
  problem_summary: 'The company needs website leads synchronized with HubSpot.',
  urgency: 'high',
  purchase_intent: 'strong',
  estimated_fit_score: 86,
  confidence: 0.91,
  missing_information: [],
  qualification_reason:
    'The integration requirement is clear and has a short delivery timeline.',
  recommended_action: 'sales_follow_up',
  response_draft: 'Thank you for describing your integration requirement.',
};

function execute(code, input) {
  return code({ all: () => [{ json: input }] })[0].json;
}

function executeScore(input, context = qualificationContext()) {
  return calculateDeterministicScore(
    { all: () => [{ json: input }] },
    (nodeName) => {
      assert.equal(nodeName, 'When Executed by Another Workflow');
      return { first: () => ({ json: context }) };
    },
  )[0].json;
}

function executeReviewOutcome(input, context = qualificationContext()) {
  return prepareAiReviewOutcome(
    { all: () => [{ json: input }] },
    (nodeName) => {
      assert.equal(nodeName, 'When Executed by Another Workflow');
      return { first: () => ({ json: context }) };
    },
  )[0].json;
}

function qualificationContext(overrides = {}) {
  return {
    lead,
    hubspot_search_success: true,
    crm_action: 'create',
    crm_match: {
      decision: 'create',
      status: 'not_found',
      contact_id: null,
    },
    ...overrides,
  };
}

function providerEnvelope(response) {
  return {
    id: 'chatcmpl_test',
    model: 'gpt-5-mini',
    choices: [
      {
        message: {
          role: 'assistant',
          content: JSON.stringify(response),
        },
      },
    ],
  };
}

function aiValidationInput(_requestContract, response) {
  return {
    content: response,
  };
}

test('main flow gates AI after combining lead and HubSpot match results', () => {
  const mergeNode = findNode(mainWorkflow, 'Merge Qualification Context');
  const executeAiNode = findNode(mainWorkflow, 'Execute AI Qualification');
  const hubspotNode = findNode(mainWorkflow, 'Execute HubSpot Contact Match');

  assert.deepEqual(mergeNode.parameters, {
    mode: 'combine',
    combineBy: 'combineByPosition',
    options: {},
  });
  assert.equal(hubspotNode.onError, 'continueRegularOutput');
  assert.equal(
    mainWorkflow.connections['Wait for Idempotency'].main[0][1].node,
    'Merge Qualification Context',
  );
  assert.equal(
    mainWorkflow.connections['Execute HubSpot Contact Match'].main[0][0].node,
    'Merge Qualification Context',
  );
  assert.equal(
    mainWorkflow.connections['Invoke AI?'].main[0][0].node,
    'Execute AI Qualification',
  );
  assert.equal(
    mainWorkflow.connections['Invoke AI?'].main[1][0].node,
    'Route Without AI',
  );
  assert.equal(executeAiNode.parameters.workflowId.value, aiWorkflow.id);
});

test('successful create and update decisions invoke AI', () => {
  for (const crmAction of ['create', 'update']) {
    const result = execute(determineAiInvocation, qualificationContext({ crm_action: crmAction }));
    assert.equal(result.continue_to_ai, true);
    assert.equal(result.ai_skip_reason, null);
  }
});

test('review and failed HubSpot searches do not invoke AI', () => {
  const review = execute(
    determineAiInvocation,
    qualificationContext({
      crm_action: 'review',
      crm_match: { decision: 'review', review_reason: 'multiple_email_matches' },
    }),
  );
  const failed = execute(
    determineAiInvocation,
    qualificationContext({
      hubspot_search_success: false,
      crm_action: null,
    }),
  );

  assert.equal(review.continue_to_ai, false);
  assert.equal(review.ai_skip_reason, 'multiple_email_matches');
  assert.equal(failed.continue_to_ai, false);
  assert.equal(failed.ai_skip_reason, 'hubspot_search_failed');
});

test('AI request contains only the five permitted business fields', () => {
  const result = execute(buildAiRequest, qualificationContext());
  const aiRequest = JSON.parse(result.messages[1].content);

  assert.deepEqual(Object.keys(result), ['model', 'messages', 'response_format']);
  assert.deepEqual(aiRequest, {
    service_requested: 'api_integration',
    enquiry_message: 'Connect our website leads with HubSpot.',
    budget_band: '5000_10000',
    timeline_band: 'within_one_month',
    company_description: 'B2B service company',
  });
  assert.equal(
    result.messages[1].content,
    JSON.stringify(aiRequest),
  );
  assert.doesNotMatch(
    result.messages[1].content,
    /Jane|Smith|jane@example|\+1555|Northwind/i,
  );
  assert.equal(result.response_format.type, 'json_schema');
  assert.equal(result.response_format.json_schema.strict, true);
  const requestSchema = result.response_format.json_schema.schema;
  assert.equal(
    Object.hasOwn(requestSchema.properties.missing_information, 'uniqueItems'),
    false,
  );
  assert.equal(requestSchema.properties.missing_information.maxItems, 5);
  assert.equal(
    canonicalAiResponseSchema.properties.missing_information.uniqueItems,
    true,
  );
  assert.doesNotMatch(
    findNode(aiWorkflow, 'Build AI Correction Request').parameters.jsCode,
    /"uniqueItems"/,
  );
});

test('expected AI response passes strict local validation', () => {
  const requestContract = execute(buildAiRequest, qualificationContext());
  const result = execute(
    validateAiResponse,
    aiValidationInput(requestContract, expectedAiResponse),
  );

  assert.equal(result.ai_validation.is_valid, true);
  assert.deepEqual(result.ai_validation.errors, []);
  assert.deepEqual(result.ai_response, expectedAiResponse);
  assert.deepEqual(Object.keys(result), ['ai_response', 'ai_validation']);
});

test('Attach AI Provider Response emits only assistant content', () => {
  const result = execute(
    attachAiProviderResponse,
    providerEnvelope(expectedAiResponse),
  );

  assert.deepEqual(Object.keys(result), ['content']);
  assert.deepEqual(result.content, expectedAiResponse);
  assert.equal(
    aiWorkflow.connections['Attach AI Provider Response'].main[0][0].node,
    'Validate AI Response',
  );
  assert.equal(
    aiWorkflow.connections['Attach AI Provider Response'].main[0][0].index,
    0,
  );
});

test('Attach AI Provider Response preserves invalid content for correction', () => {
  const result = execute(attachAiProviderResponse, {
    choices: [{ message: { content: 'not valid JSON' } }],
  });

  assert.deepEqual(result, { content: 'not valid JSON' });
});

test('invalid enums, ranges, and additional properties are rejected', () => {
  const requestContract = execute(buildAiRequest, qualificationContext());
  const invalid = {
    ...expectedAiResponse,
    urgency: 'critical',
    estimated_fit_score: 101,
    confidence: 1.1,
    extra: true,
  };
  const result = execute(
    validateAiResponse,
    aiValidationInput(requestContract, invalid),
  );

  assert.equal(result.ai_validation.is_valid, false);
  assert.ok(result.ai_validation.errors.some((error) => error.includes('urgency')));
  assert.ok(result.ai_validation.errors.some((error) => error.includes('estimated_fit_score')));
  assert.ok(result.ai_validation.errors.some((error) => error.includes('confidence')));
  assert.ok(result.ai_validation.errors.some((error) => error.includes('extra')));
});

test('schema-invalid output receives one correction attempt before review', () => {
  assert.equal(
    aiWorkflow.connections['Is AI Response Valid?'].main[0][0].node,
    'Calculate Deterministic Score',
  );
  assert.equal(
    aiWorkflow.connections['Is AI Response Valid?'].main[1][0].node,
    'Build AI Correction Request',
  );
  assert.equal(
    aiWorkflow.connections['Is AI Correction Valid?'].main[0][0].node,
    'Calculate Deterministic Score',
  );
  assert.equal(
    aiWorkflow.connections['Is AI Correction Valid?'].main[1][0].node,
    'Prepare AI Review Outcome',
  );
  assert.equal(
    Object.hasOwn(aiWorkflow.connections, 'Prepare AI Review Outcome'),
    false,
  );
  assert.equal(
    aiWorkflow.nodes.filter((node) => node.name.startsWith('Invoke OpenAI')).length,
    2,
  );
  assert.equal(
    aiWorkflow.nodes.some((node) => node.name === 'Merge AI Decision Context'),
    false,
  );
  assert.equal(
    aiWorkflow.nodes.some((node) => node.name === 'Merge AI Review Context'),
    false,
  );
  for (const nodeName of ['Invoke OpenAI', 'Invoke OpenAI Correction']) {
    assert.deepEqual(findNode(aiWorkflow, nodeName).credentials.openAiApi, {
      id: '4PtmLVMwWUnSv4NM',
      name: 'OpenAI account',
    });
  }
});

test('review outcome is minimal and reads CRM context explicitly', () => {
  const result = executeReviewOutcome(
    {
      ai_response: null,
      ai_validation: {
        is_valid: false,
        errors: ['urgency is not an allowed value'],
      },
    },
    qualificationContext({
      crm_action: 'update',
      crm_match: {
        decision: 'update',
        status: 'matched',
        contact_id: '123',
      },
    }),
  );

  assert.deepEqual(result, {
    review_outcome: {
      final_score: null,
      final_route: 'human_review',
      route_reason: 'invalid_ai_response',
      validation_errors: ['urgency is not an allowed value'],
      crm_action: 'update',
      contact_id: '123',
    },
  });
  assert.deepEqual(Object.keys(result), ['review_outcome']);
});

test('deterministic score and route do not use the AI estimated score', () => {
  const requestContract = execute(buildAiRequest, qualificationContext());
  const validated = execute(
    validateAiResponse,
    aiValidationInput(requestContract, {
      ...expectedAiResponse,
      estimated_fit_score: 1,
      recommended_action: 'nurture',
    }),
  );
  const resultWithContext = executeScore(validated);

  assert.equal(resultWithContext.deterministic_decision.final_score, 95);
  assert.equal(resultWithContext.deterministic_decision.final_route, 'sales_qualified');
  assert.equal(resultWithContext.deterministic_decision.ai_estimated_fit_score, 1);
  assert.equal(resultWithContext.deterministic_decision.ai_recommended_action, 'nurture');
});

test('confidence below 0.75 overrides the deterministic score band', () => {
  const requestContract = execute(buildAiRequest, qualificationContext());
  const validated = execute(
    validateAiResponse,
    aiValidationInput(requestContract, {
      ...expectedAiResponse,
      confidence: 0.74,
    }),
  );
  const result = executeScore(validated);

  assert.equal(result.deterministic_decision.final_score, 95);
  assert.equal(result.deterministic_decision.final_route, 'human_review');
  assert.equal(result.deterministic_decision.route_reason, 'low_ai_confidence');
});
