import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const assetDirectory = path.resolve(scriptDirectory, '..');
const sourceDirectory = path.join(assetDirectory, 'src');
const workflowsDirectory = path.join(assetDirectory, 'workflows');
fs.mkdirSync(workflowsDirectory, { recursive: true });

const readSource = (name) => fs.readFileSync(path.join(sourceDirectory, name), 'utf8');
const readSchema = (name) => JSON.parse(fs.readFileSync(path.join(assetDirectory, 'schemas', name), 'utf8'));
const OPENAI_UNSUPPORTED_SCHEMA_KEYWORDS = new Set([
  '$schema',
  '$id',
  'title',
  'uniqueItems',
  'minLength',
  'maxLength',
]);
const openAiSchema = (schema) => {
  if (Array.isArray(schema)) return schema.map(openAiSchema);
  if (!schema || typeof schema !== 'object') return schema;
  return Object.fromEntries(
    Object.entries(schema)
      .filter(([key]) => !OPENAI_UNSUPPORTED_SCHEMA_KEYWORDS.has(key))
      .map(([key, value]) => [key, openAiSchema(value)]),
  );
};

function code(id, name, position, jsCode) {
  return { parameters: { mode: 'runOnceForAllItems', jsCode }, type: 'n8n-nodes-base.code', typeVersion: 2, position, id, name };
}

function ifBoolean(id, name, position, expression) {
  return {
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ id: `${id}-condition`, leftValue: expression, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} },
    type: 'n8n-nodes-base.if', typeVersion: 2.2, position, id, name,
  };
}

function switchStrings(id, name, position, expression, values) {
  return {
    parameters: { rules: { values: values.map((value) => ({ conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ id: `${id}-${value}`, leftValue: expression, rightValue: value, operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, renameOutput: true, outputKey: value })) }, options: {} },
    type: 'n8n-nodes-base.switch', typeVersion: 3.2, position, id, name,
  };
}

function noOp(id, name, position) {
  return { parameters: {}, type: 'n8n-nodes-base.noOp', typeVersion: 1, position, id, name };
}

function executeChild(id, name, position, workflowId, fields) {
  return {
    parameters: {
      source: 'database', workflowId: { __rl: true, value: workflowId, mode: 'id' },
      workflowInputs: { mappingMode: 'defineBelow', value: fields, matchingColumns: [], schema: Object.entries(fields).map(([name]) => ({ id: name, displayName: name, required: true, defaultMatch: false, display: true, canBeUsedToMatch: true, type: name === 'conversation_context' ? 'array' : 'object' })), attemptToConvertTypes: false, convertFieldsToString: false },
      mode: 'once', options: { waitForSubWorkflow: true },
    },
    type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.3, position, id, name,
  };
}

function childTrigger(id, fields) {
  return {
    parameters: { inputSource: 'workflowInputs', workflowInputs: { values: fields } },
    type: 'n8n-nodes-base.executeWorkflowTrigger', typeVersion: 1.2, position: [260, 300], id, name: 'When Executed by Another Workflow',
  };
}

function openAiNode(id, name, position) {
  return {
    parameters: { method: 'POST', url: 'https://api.openai.com/v1/chat/completions', authentication: 'predefinedCredentialType', nodeCredentialType: 'openAiApi', sendHeaders: true, headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] }, sendBody: true, contentType: 'raw', rawContentType: 'application/json', body: '={{ JSON.stringify($json) }}', options: { timeout: 60000 } },
    type: 'n8n-nodes-base.httpRequest', typeVersion: 4.3, position, id, name,
    retryOnFail: true, maxTries: 2, waitBetweenTries: 5000, onError: 'stopWorkflow',
    credentials: { openAiApi: { id: '4PtmLVMwWUnSv4NM', name: 'OpenAI account' } },
  };
}

const triageSchema = openAiSchema(readSchema('triage-response.schema.json'));
const responseSchema = openAiSchema(readSchema('grounded-response.schema.json'));
const triageRequestSource = readSource('build-triage-request.js').replace('__TRIAGE_SCHEMA__', JSON.stringify(triageSchema));
const responseRequestSource = readSource('build-response-request.js').replace('__RESPONSE_SCHEMA__', JSON.stringify(responseSchema));

const aiTriage = {
  id: 'ASSET002AITriage01', name: 'ASSET002 - AI Triage',
  nodes: [
    childTrigger('asset002-triage-trigger', [
      { name: 'support_event', type: 'object' },
      { name: 'conversation_context', type: 'array' },
    ]),
    code('asset002-build-triage-request', 'Build Triage Request', [520, 300], triageRequestSource),
    openAiNode('asset002-invoke-triage-ai', 'Invoke Triage AI', [780, 300]),
    code('asset002-validate-triage', 'Validate Triage Response', [1040, 300], readSource('validate-triage-response.js')),
    code('asset002-apply-triage-routing', 'Apply Deterministic Triage Routing', [1300, 300], readSource('apply-triage-routing.js')),
  ],
  connections: {
    'When Executed by Another Workflow': { main: [[{ node: 'Build Triage Request', type: 'main', index: 0 }]] },
    'Build Triage Request': { main: [[{ node: 'Invoke Triage AI', type: 'main', index: 0 }]] },
    'Invoke Triage AI': { main: [[{ node: 'Validate Triage Response', type: 'main', index: 0 }]] },
    'Validate Triage Response': { main: [[{ node: 'Apply Deterministic Triage Routing', type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1', timezone: 'Europe/Kiev', callerPolicy: 'workflowsFromAList', callerIds: 'ASSET002Main01' }, active: false, pinData: {}, tags: [], meta: { templateCredsSetupCompleted: true },
};

const responsePreparation = {
  id: 'ASSET002ResponsePreparation01', name: 'ASSET002 - Response Preparation',
  nodes: [
    childTrigger('asset002-response-trigger', [
      { name: 'support_event', type: 'object' },
      { name: 'triage', type: 'object' },
      { name: 'conversation_context', type: 'array' },
    ]),
    code('asset002-validate-response-input', 'Validate Response Input', [520, 300], readSource('validate-response-input.js')),
    ifBoolean('asset002-should-search', 'Response Input Valid?', [780, 300], '={{ $json.validation.is_valid }}'),
    code('asset002-build-knowledge-query', 'Build Knowledge Query', [1040, 220], readSource('build-knowledge-query.js')),
    {
      parameters: { resource: 'row', operation: 'get', dataTableId: { __rl: true, value: 'asset002_approved_knowledge', mode: 'name' }, returnAll: true },
      type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, position: [1300, 220], id: 'asset002-read-approved-knowledge', name: 'Read Approved Knowledge', alwaysOutputData: true, onError: 'continueRegularOutput',
    },
    code('asset002-select-approved-knowledge', 'Select Approved Knowledge', [1560, 220], readSource('select-approved-knowledge.js')),
    ifBoolean('asset002-knowledge-found', 'Approved Knowledge Found?', [1820, 220], '={{ $json.knowledge_found }}'),
    code('asset002-build-response-request', 'Build Grounded Response Request', [2080, 140], responseRequestSource),
    openAiNode('asset002-invoke-response-ai', 'Invoke Response AI', [2340, 140]),
    code('asset002-attach-response-provider', 'Attach Response Provider Output', [2600, 140], readSource('attach-response-provider.js')),
    code('asset002-validate-grounded-response', 'Validate Grounded Response', [2860, 140], readSource('validate-grounded-response.js')),
    code('asset002-no-knowledge', 'Prepare No Knowledge Result', [2080, 300], readSource('prepare-no-knowledge-response.js')),
    code('asset002-manual-response', 'Prepare Manual Handling Result', [1040, 420], readSource('prepare-manual-response.js')),
  ],
  connections: {
    'When Executed by Another Workflow': { main: [[{ node: 'Validate Response Input', type: 'main', index: 0 }]] },
    'Validate Response Input': { main: [[{ node: 'Response Input Valid?', type: 'main', index: 0 }]] },
    'Response Input Valid?': { main: [[{ node: 'Build Knowledge Query', type: 'main', index: 0 }], [{ node: 'Prepare Manual Handling Result', type: 'main', index: 0 }]] },
    'Build Knowledge Query': { main: [[{ node: 'Read Approved Knowledge', type: 'main', index: 0 }]] },
    'Read Approved Knowledge': { main: [[{ node: 'Select Approved Knowledge', type: 'main', index: 0 }]] },
    'Select Approved Knowledge': { main: [[{ node: 'Approved Knowledge Found?', type: 'main', index: 0 }]] },
    'Approved Knowledge Found?': { main: [[{ node: 'Build Grounded Response Request', type: 'main', index: 0 }], [{ node: 'Prepare No Knowledge Result', type: 'main', index: 0 }]] },
    'Build Grounded Response Request': { main: [[{ node: 'Invoke Response AI', type: 'main', index: 0 }]] },
    'Invoke Response AI': { main: [[{ node: 'Attach Response Provider Output', type: 'main', index: 0 }]] },
    'Attach Response Provider Output': { main: [[{ node: 'Validate Grounded Response', type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1', timezone: 'Europe/Kiev', callerPolicy: 'workflowsFromAList', callerIds: 'ASSET002Main01' }, active: false, pinData: {}, tags: [], meta: { templateCredsSetupCompleted: true },
};

const prepareMessage = {
  id: 'ASSET002PrepareMessage01', name: 'ASSET002 - Prepare Message',
  nodes: [
    childTrigger('asset002-prepare-message-trigger', [{ name: 'raw_event', type: 'object' }]),
    code('asset002-normalize-event', 'Normalize Chatwoot Event', [520, 300], readSource('normalize-chatwoot-event.js')),
    code('asset002-validate-event', 'Validate Support Event', [780, 300], readSource('validate-support-event.js')),
    ifBoolean('asset002-event-valid', 'Is Event Valid?', [1040, 300], '={{ $json.validation.is_valid }}'),
    switchStrings('asset002-route-event', 'Route Event Kind', [1300, 220], '={{ $json.support_event.event_kind }}', ['incoming_customer_message', 'ignored']),
    code('asset002-prepare-incoming', 'Prepare Incoming Message', [1560, 80], readSource('prepare-incoming-message.js')),
    code('asset002-prepare-ignored-event', 'Prepare Ignored Event', [1560, 340], readSource('prepare-non-incoming-message.js')),
    code('asset002-prepare-invalid-event', 'Prepare Invalid Event', [1300, 520], readSource('prepare-invalid-message.js')),
  ],
  connections: {
    'When Executed by Another Workflow': { main: [[{ node: 'Normalize Chatwoot Event', type: 'main', index: 0 }]] },
    'Normalize Chatwoot Event': { main: [[{ node: 'Validate Support Event', type: 'main', index: 0 }]] },
    'Validate Support Event': { main: [[{ node: 'Is Event Valid?', type: 'main', index: 0 }]] },
    'Is Event Valid?': { main: [[{ node: 'Route Event Kind', type: 'main', index: 0 }], [{ node: 'Prepare Invalid Event', type: 'main', index: 0 }]] },
    'Route Event Kind': { main: [[{ node: 'Prepare Incoming Message', type: 'main', index: 0 }], [{ node: 'Prepare Ignored Event', type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1', timezone: 'Europe/Kiev', callerPolicy: 'workflowsFromAList', callerIds: 'ASSET002Main01' }, active: false, pinData: {}, tags: [], meta: { templateCredsSetupCompleted: true },
};

const main = {
  id: 'ASSET002Main01', name: 'ASSET002 - Human-in-the-Loop Support Triage',
  nodes: [
    {
      parameters: { httpMethod: 'POST', path: 'asset002-chatwoot-events', responseMode: 'onReceived', options: {} },
      type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [260, 300], id: 'asset002-chatwoot-webhook', name: 'Chatwoot Webhook', webhookId: '2d22b8a9-9b56-49d9-9d69-asset0020001',
    },
    ifBoolean('asset002-webhook-authorized', 'Automation Webhook Authorized?', [520, 300], "={{ typeof $env.CHATWOOT_AUTOMATION_WEBHOOK_TOKEN === 'string' && $env.CHATWOOT_AUTOMATION_WEBHOOK_TOKEN.length >= 32 && $json.query?.token === $env.CHATWOOT_AUTOMATION_WEBHOOK_TOKEN }}"),
    executeChild('asset002-execute-prepare-message', 'Execute Prepare Message', [780, 220], 'ASSET002PrepareMessage01', { raw_event: '={{ $json }}' }),
    noOp('asset002-unauthorized-webhook', 'Unauthorized Automation Webhook', [780, 420]),
    switchStrings('asset002-route-prepared-message', 'Route Prepared Message', [1040, 220], '={{ $json.route }}', ['incoming_customer_message', 'ignored', 'invalid']),
    {
      parameters: {
        method: 'GET', url: "={{ $env.CHATWOOT_BASE_URL + '/api/v1/accounts/' + $('Execute Prepare Message').first().json.support_event.account_id + '/conversations/' + $('Execute Prepare Message').first().json.support_event.conversation_id + '/messages' }}",
        sendHeaders: true, headerParameters: { parameters: [{ name: 'api_access_token', value: '={{ $env.CHATWOOT_API_ACCESS_TOKEN }}' }] }, options: { timeout: 30000 },
      },
      type: 'n8n-nodes-base.httpRequest', typeVersion: 4.3, position: [1300, 40], id: 'asset002-fetch-history', name: 'Fetch Chatwoot Conversation History',
      retryOnFail: true, maxTries: 3, waitBetweenTries: 3000, onError: 'continueRegularOutput',
    },
    code('asset002-prepare-context', 'Prepare Conversation Context', [1560, 40], readSource('prepare-conversation-context.js')),
    executeChild('asset002-execute-triage', 'Execute AI Triage', [1820, 40], 'ASSET002AITriage01', { support_event: '={{ $json.support_event }}', conversation_context: '={{ $json.conversation_context }}' }),
    executeChild('asset002-execute-response', 'Execute Response Preparation', [2080, 40], 'ASSET002ResponsePreparation01', { support_event: "={{ $('Prepare Conversation Context').first().json.support_event }}", triage: '={{ $json.triage }}', conversation_context: "={{ $('Prepare Conversation Context').first().json.conversation_context }}" }),
    code('asset002-prepare-review-note', 'Prepare Chatwoot Review Note', [2340, 40], readSource('prepare-chatwoot-review-note.js')),
    {
      parameters: {
        method: 'POST', url: "={{ $env.CHATWOOT_BASE_URL + '/api/v1/accounts/' + $json.account_id + '/conversations/' + $json.conversation_id + '/messages' }}",
        sendHeaders: true, headerParameters: { parameters: [{ name: 'api_access_token', value: '={{ $env.CHATWOOT_API_ACCESS_TOKEN }}' }, { name: 'Content-Type', value: 'application/json' }] },
        sendBody: true, contentType: 'raw', rawContentType: 'application/json', body: '={{ JSON.stringify($json.chatwoot_request) }}', options: { timeout: 30000 },
      },
      type: 'n8n-nodes-base.httpRequest', typeVersion: 4.3, position: [2600, 40], id: 'asset002-create-private-note', name: 'Create Chatwoot Private Note', notesInFlow: true, notes: 'Creates a private internal note only. This node never sends a public customer message.', onError: 'stopWorkflow',
    },
    noOp('asset002-ignored-event', 'Ignored Chatwoot Event', [1300, 300]),
    noOp('asset002-invalid-event', 'Invalid Event Rejected', [1300, 500]),
  ],
  connections: {
    'Chatwoot Webhook': { main: [[{ node: 'Automation Webhook Authorized?', type: 'main', index: 0 }]] },
    'Automation Webhook Authorized?': { main: [[{ node: 'Execute Prepare Message', type: 'main', index: 0 }], [{ node: 'Unauthorized Automation Webhook', type: 'main', index: 0 }]] },
    'Execute Prepare Message': { main: [[{ node: 'Route Prepared Message', type: 'main', index: 0 }]] },
    'Route Prepared Message': { main: [[{ node: 'Fetch Chatwoot Conversation History', type: 'main', index: 0 }], [{ node: 'Ignored Chatwoot Event', type: 'main', index: 0 }], [{ node: 'Invalid Event Rejected', type: 'main', index: 0 }]] },
    'Fetch Chatwoot Conversation History': { main: [[{ node: 'Prepare Conversation Context', type: 'main', index: 0 }]] },
    'Prepare Conversation Context': { main: [[{ node: 'Execute AI Triage', type: 'main', index: 0 }]] },
    'Execute AI Triage': { main: [[{ node: 'Execute Response Preparation', type: 'main', index: 0 }]] },
    'Execute Response Preparation': { main: [[{ node: 'Prepare Chatwoot Review Note', type: 'main', index: 0 }]] },
    'Prepare Chatwoot Review Note': { main: [[{ node: 'Create Chatwoot Private Note', type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1', timezone: 'Europe/Kiev' }, active: false, pinData: {}, tags: [], meta: { templateCredsSetupCompleted: true },
};

for (const [file, workflow] of [
  ['ASSET002-prepare-message.json', prepareMessage],
  ['ASSET002-main-flow.json', main],
  ['ASSET002-ai-triage.json', aiTriage],
  ['ASSET002-response-preparation.json', responsePreparation],
]) {
  fs.writeFileSync(path.join(workflowsDirectory, file), `${JSON.stringify(workflow, null, 2)}\n`);
}
