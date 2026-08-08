import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const assetDirectory = path.resolve(testDirectory, '..');
const load = (file) => JSON.parse(fs.readFileSync(path.join(assetDirectory, 'workflows', file), 'utf8'));
const main = load('ASSET002-main-flow.json');
const prepareWorkflow = load('ASSET002-prepare-message.json');
const triageWorkflow = load('ASSET002-ai-triage.json');
const responseWorkflow = load('ASSET002-response-preparation.json');

function findNode(workflow, name) {
  const node = workflow.nodes.find((candidate) => candidate.name === name);
  assert.ok(node, `${name} node is missing`);
  return node;
}

function code(workflow, name) {
  return new Function('$input', '$', 'require', findNode(workflow, name).parameters.jsCode);
}

function input(value, many = null) {
  const items = many ?? [{ json: value }];
  return { first: () => items[0], all: () => items };
}

const nodeContext = (contexts) => (name) => ({ first: () => ({ json: contexts[name] }) });

test('exports one parent and three bounded child workflows with stable IDs', () => {
  assert.equal(main.id, 'ASSET002Main01');
  assert.equal(prepareWorkflow.id, 'ASSET002PrepareMessage01');
  assert.equal(triageWorkflow.id, 'ASSET002AITriage01');
  assert.equal(responseWorkflow.id, 'ASSET002ResponsePreparation01');
  assert.equal(findNode(main, 'Execute Prepare Message').parameters.workflowId.value, prepareWorkflow.id);
  assert.equal(findNode(main, 'Execute AI Triage').parameters.workflowId.value, triageWorkflow.id);
  assert.equal(findNode(main, 'Execute Response Preparation').parameters.workflowId.value, responseWorkflow.id);
  assert.equal(findNode(triageWorkflow, 'When Executed by Another Workflow').parameters.inputSource, 'workflowInputs');
  assert.equal(findNode(responseWorkflow, 'When Executed by Another Workflow').parameters.inputSource, 'workflowInputs');
  assert.equal(findNode(prepareWorkflow, 'When Executed by Another Workflow').parameters.inputSource, 'workflowInputs');
});

test('normalization accepts an incoming Chatwoot event and removes undeclared data', () => {
  const normalize = code(prepareWorkflow, 'Normalize Chatwoot Event');
  const result = normalize(input({ raw_event: { body: {
    event: 'message_created', id: 81, message_type: 'incoming', content: '  Need help\r\nnow  ',
    private: false, account: { id: 7 }, conversation: { id: 42, channel: 'Channel::WebWidget' },
    sender: { name: 'Test User', email: 'USER@EXAMPLE.COM', secret: 'not-forwarded' }, ignored: 'value',
  } } }), () => {}, require)[0].json;

  assert.deepEqual(result, {
    event_kind: 'incoming_customer_message', event_name: 'message_created', conversation_id: '42',
    message_id: '81', inbox_id: null, account_id: '7', channel: 'Channel::WebWidget',
    message: 'Need help\nnow', sender_name: 'Test User', sender_email: 'user@example.com', occurred_at: null,
  });
});

test('normalization accepts a filtered Chatwoot automation payload', () => {
  const normalize = code(prepareWorkflow, 'Normalize Chatwoot Event');
  const result = normalize(input({ raw_event: { body: {
    event: 'automation_event.message_created', id: 42, inbox_id: 3,
    channel: 'Channel::WebWidget', account: { id: 7 },
    messages: [{
      id: 91, account_id: 7, inbox_id: 3, conversation_id: 42,
      message_type: 0, content: '  Automation message  ', created_at: 1786071600,
      sender: { name: 'Automation Customer', email: 'CUSTOMER@EXAMPLE.COM' },
    }],
  } } }), () => {}, require)[0].json;

  assert.deepEqual(result, {
    event_kind: 'incoming_customer_message', event_name: 'automation_event.message_created',
    conversation_id: '42', message_id: '91', inbox_id: '3', account_id: '7',
    channel: 'Channel::WebWidget', message: 'Automation message',
    sender_name: 'Automation Customer', sender_email: 'customer@example.com',
    occurred_at: '2026-08-07T03:00:00.000Z',
  });
});

test('normalization ignores public outgoing agent messages', () => {
  const normalize = code(prepareWorkflow, 'Normalize Chatwoot Event');
  const result = normalize(input({ raw_event: { body: {
    event: 'message_created', id: 82, message_type: 'outgoing', content: 'Agent reply',
    private: false, account: { id: 7 }, conversation: { id: 42 },
  } } }), () => {}, require)[0].json;
  assert.equal(result.event_kind, 'ignored');
});

test('validation rejects a malformed external event without echoing its message', () => {
  const validate = code(prepareWorkflow, 'Validate Support Event');
  const result = validate(input({ event_kind: 'incoming_customer_message', conversation_id: null, message_id: null, account_id: null, message: 'private submitted text' }), () => {}, require)[0].json;
  assert.equal(result.validation.is_valid, false);
  assert.equal(result.support_event, null);
  assert.ok(result.validation.errors.some((error) => error.field === 'conversation_id'));
  assert.doesNotMatch(JSON.stringify(result.validation.errors), /private submitted text/);
});

test('incoming preparation creates a fresh correlation ID without idempotency state', () => {
  const prepare = code(prepareWorkflow, 'Prepare Incoming Message');
  const item = { support_event: { message_id: '81' }, validation: { is_valid: true, errors: [] } };
  const first = prepare(input(item), () => {}, require)[0].json;
  const second = prepare(input(item), () => {}, require)[0].json;
  assert.equal(first.route, 'incoming_customer_message');
  assert.notEqual(first.correlation_id, second.correlation_id);
  assert.equal(Object.hasOwn(first, 'idempotency_key'), false);
  assert.equal(Object.hasOwn(first, 'idempotency'), false);
});

test('ASSET002 has no processing-audit or PostgreSQL dependency', () => {
  assert.equal(main.nodes.some((node) => node.type === 'n8n-nodes-base.postgres'), false);
  assert.doesNotMatch(JSON.stringify([main, prepareWorkflow]), /asset002_audit|Start Processing Audit|Complete Processing Audit|Record Processing Failure/i);
  assert.doesNotMatch(JSON.stringify([main, prepareWorkflow]), /idempotency|incoming_duplicate|Duplicate Event Ignored/i);
});

test('deterministic routing sends low-confidence and sensitive output to priority review', () => {
  const route = code(triageWorkflow, 'Apply Deterministic Triage Routing');
  const result = route(input({
    workflow_input: {}, triage_validation: { is_valid: true, errors: [] },
    triage_candidate: {
      category: 'account_access', intent: 'security_report', urgency: 'high', sentiment: 'negative',
      assigned_team: 'account_security', sensitivity_flags: ['security'], confidence: 0.6,
      summary: 'Possible account compromise.', escalation_reason: 'security concern',
    },
  }), () => {}, require)[0].json;
  assert.equal(result.triage.route, 'priority_review');
  assert.equal(Object.hasOwn(result.triage, 'safe_for_drafting'), false);
  assert.deepEqual(result.triage.reason_codes, ['low_triage_confidence', 'sensitive_subject']);
});

test('invalid AI triage output falls back to specialist review', () => {
  const validate = code(triageWorkflow, 'Validate Triage Response');
  const route = code(triageWorkflow, 'Apply Deterministic Triage Routing');
  const checked = validate(input({ choices: [{ message: { content: '{bad json' } }] }), () => {}, require)[0].json;
  const result = route(input(checked), () => {}, require)[0].json;
  assert.equal(result.triage.assigned_team, 'specialist_review');
  assert.equal(Object.hasOwn(result.triage, 'safe_for_drafting'), false);
  assert.equal(result.triage.reason_codes[0], 'invalid_ai_output');
});

test('response preparation accepts priority-review triage without a drafting gate', () => {
  const validate = code(responseWorkflow, 'Validate Response Input');
  const result = validate(input({
    support_event: { message: 'Please cancel my account.' },
    triage: { category: 'cancellation_refund', summary: 'Cancellation request.', route: 'priority_review' },
    conversation_context: [],
  }), () => {}, require)[0].json;
  assert.equal(result.validation.is_valid, true);
  assert.equal(Object.hasOwn(result, 'should_search'), false);
  assert.match(findNode(responseWorkflow, 'Response Input Valid?').parameters.conditions.conditions[0].leftValue, /validation\.is_valid/);
});

test('knowledge selection uses approved rows only and emits a minimal source contract', () => {
  const select = code(responseWorkflow, 'Select Approved Knowledge');
  const contexts = { 'Build Knowledge Query': { response_input: { triage: {} }, knowledge_query: { category: 'billing_payments', terms: ['invoice'] } } };
  const rows = [
    { json: { knowledge_id: 'KB-1', title: 'Invoices', category: 'billing_payments', keywords: 'invoice billing', content: 'Approved invoice guidance.', approved: true, source_url: 'https://example.com/kb/1', extra: 'not-forwarded' } },
    { json: { knowledge_id: 'KB-2', title: 'Hidden', category: 'billing_payments', keywords: 'invoice', content: 'Unapproved content.', approved: false } },
  ];
  const result = select(input({}, rows), nodeContext(contexts), require)[0].json;
  assert.equal(result.knowledge_found, true);
  assert.deepEqual(result.knowledge, [{ knowledge_id: 'KB-1', title: 'Invoices', content: 'Approved invoice guidance.', source_url: 'https://example.com/kb/1' }]);
});

test('grounded response rejects source identifiers that were not retrieved', () => {
  const validate = code(responseWorkflow, 'Validate Grounded Response');
  const selected = { knowledge: [{ knowledge_id: 'KB-1', title: 'One', source_url: null }] };
  const result = validate(input({ selected, provider_content: JSON.stringify({
    proposed_response: 'Draft', source_ids: ['KB-NOT-RETRIEVED'], confidence: 0.9,
    recommended_agent_action: 'approve', warnings: [],
  }) }), () => {}, require)[0].json;
  assert.equal(result.response_preparation.status, 'manual_handling');
  assert.equal(result.response_preparation.proposed_response, null);
  assert.ok(result.validation.errors.some((error) => error.code === 'unsupported_source'));
});

test('Prepare Message owns normalization, validation, and event preparation before main-flow AI', () => {
  assert.equal(main.nodes.some((node) => node.name === 'Normalize Chatwoot Event'), false);
  assert.equal(main.nodes.some((node) => node.name === 'Validate Support Event'), false);
  assert.equal(main.nodes.some((node) => node.name === 'Claim Message Processing'), false);
  assert.equal(prepareWorkflow.connections['Normalize Chatwoot Event'].main[0][0].node, 'Validate Support Event');
  assert.equal(prepareWorkflow.connections['Route Event Kind'].main[0][0].node, 'Prepare Incoming Message');
  assert.equal(prepareWorkflow.connections['Route Event Kind'].main[1][0].node, 'Prepare Ignored Event');
  assert.equal(prepareWorkflow.connections['Route Event Kind'].main.length, 2);
  assert.equal(prepareWorkflow.nodes.some((node) => /Idempotency|Claim Message/.test(node.name)), false);
});

test('main flow is orchestration-only and creates only a private Chatwoot note', () => {
  const note = findNode(main, 'Create Chatwoot Private Note');
  assert.match(note.parameters.body, /chatwoot_request/);
  assert.match(note.notes, /private internal note/i);
  assert.equal(main.nodes.some((node) => /Send.*Customer|Public Reply/i.test(node.name)), false);
  assert.equal(main.connections['Chatwoot Webhook'].main[0][0].node, 'Automation Webhook Authorized?');
  assert.equal(main.connections['Automation Webhook Authorized?'].main[0][0].node, 'Execute Prepare Message');
  assert.equal(main.connections['Automation Webhook Authorized?'].main[1][0].node, 'Unauthorized Automation Webhook');
  assert.match(findNode(main, 'Automation Webhook Authorized?').parameters.conditions.conditions[0].leftValue, /CHATWOOT_AUTOMATION_WEBHOOK_TOKEN/);
  assert.equal(main.connections['Execute Prepare Message'].main[0][0].node, 'Route Prepared Message');
  assert.equal(main.connections['Route Prepared Message'].main[0][0].node, 'Fetch Chatwoot Conversation History');
  assert.equal(main.connections['Prepare Conversation Context'].main[0][0].node, 'Execute AI Triage');
  assert.equal(main.nodes.some((node) => node.name === 'Duplicate Event Ignored'), false);
  assert.equal(main.nodes.some((node) => node.name === 'Record Agent Delivery'), false);
  assert.doesNotMatch(JSON.stringify([main, prepareWorkflow]), /agent_deliveries|agent_public_message/i);
  assert.equal(findNode(main, 'Create Chatwoot Private Note').onError, 'stopWorkflow');
  assert.equal(Object.hasOwn(main.connections, 'Create Chatwoot Private Note'), false);
});

test('conversation history adapter excludes private and current messages and bounds context', () => {
  const prepare = code(main, 'Prepare Conversation Context');
  const claim = { support_event: { message_id: '99', message: 'Current' } };
  const messages = [
    { id: 1, message_type: 'incoming', private: false, content: 'Earlier question' },
    { id: 2, message_type: 'outgoing', private: true, content: 'Private agent note' },
    { id: 99, message_type: 'incoming', private: false, content: 'Current' },
  ];
  const result = prepare(input({ payload: messages }), nodeContext({ 'Execute Prepare Message': claim }), require)[0].json;
  assert.deepEqual(result.conversation_context, [{ role: 'customer', content: 'Earlier question' }]);
});

test('both AI calls use strict schemas and trusted fixed model defaults', () => {
  const triageBuild = findNode(triageWorkflow, 'Build Triage Request').parameters.jsCode;
  const responseBuild = findNode(responseWorkflow, 'Build Grounded Response Request').parameters.jsCode;
  assert.match(triageBuild, /gpt-5-mini/);
  assert.match(responseBuild, /gpt-5-mini/);
  assert.match(triageBuild, /strict: true/);
  assert.match(responseBuild, /strict: true/);
  assert.doesNotMatch(triageBuild, /uniqueItems|minLength|maxLength/);
  assert.doesNotMatch(responseBuild, /uniqueItems|minLength|maxLength/);
  assert.equal(findNode(triageWorkflow, 'Invoke Triage AI').credentials.openAiApi.name, 'OpenAI account');
  assert.equal(findNode(responseWorkflow, 'Invoke Response AI').credentials.openAiApi.name, 'OpenAI account');
  assert.equal(findNode(triageWorkflow, 'Invoke Triage AI').onError, 'stopWorkflow');
  assert.equal(findNode(responseWorkflow, 'Invoke Response AI').onError, 'stopWorkflow');
});

test('triage validates the provider response directly without an attachment node', () => {
  assert.equal(triageWorkflow.nodes.some((node) => node.name === 'Attach Triage Provider Response'), false);
  assert.equal(triageWorkflow.connections['Invoke Triage AI'].main[0][0].node, 'Validate Triage Response');
  assert.doesNotMatch(findNode(triageWorkflow, 'Validate Triage Response').parameters.jsCode, /workflow_input/);
});
