import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const assetDirectory = path.resolve(scriptDirectory, '..');
const workflowsDirectory = path.join(assetDirectory, 'workflows');
const workflowPath = path.join(workflowsDirectory, 'ASSET001-website-lead-form.json');
const idempotencyWorkflowPath = path.join(
  workflowsDirectory,
  'ASSET001-idempotency-guard.json',
);
const hubspotMatchWorkflowPath = path.join(
  workflowsDirectory,
  'ASSET001-hubspot-contact-match.json',
);
const aiQualificationWorkflowPath = path.join(
  workflowsDirectory,
  'ASSET001-ai-qualification.json',
);
const hubspotCrmWorkflowPath = path.join(
  workflowsDirectory,
  'ASSET001-hubspot-contact-deal.json',
);
const sourceDirectory = path.join(assetDirectory, 'src');
const normalizationSourcePath = path.join(sourceDirectory, 'normalize-lead.js');
const validationSourcePath = path.join(sourceDirectory, 'validate-lead.js');

const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
const normalizationSource = fs.readFileSync(normalizationSourcePath, 'utf8');
const validationSource = fs.readFileSync(validationSourcePath, 'utf8');
const idempotencySource = fs.readFileSync(
  path.join(sourceDirectory, 'generate-idempotency-key.js'),
  'utf8',
);
const finalizeResultSource = fs.readFileSync(
  path.join(sourceDirectory, 'finalize-idempotency-result.js'),
  'utf8',
);
const bypassSource = fs.readFileSync(
  path.join(sourceDirectory, 'bypass-idempotency.js'),
  'utf8',
);
const applyConfigSource = fs.readFileSync(
  path.join(sourceDirectory, 'apply-idempotency-config.js'),
  'utf8',
);
const evaluateEmailResultsSource = fs.readFileSync(
  path.join(sourceDirectory, 'evaluate-email-results.js'),
  'utf8',
);
const evaluatePhoneResultsSource = fs.readFileSync(
  path.join(sourceDirectory, 'evaluate-phone-results.js'),
  'utf8',
);
const produceMatchDecisionSource = fs.readFileSync(
  path.join(sourceDirectory, 'produce-match-decision.js'),
  'utf8',
);
const determineAiInvocationSource = fs.readFileSync(
  path.join(sourceDirectory, 'determine-ai-invocation.js'),
  'utf8',
);
const aiResponseSchema = JSON.parse(fs.readFileSync(
  path.join(assetDirectory, 'schemas', 'ai-qualification-response.schema.json'),
  'utf8',
));
const openAiCompatibleSchema = structuredClone(aiResponseSchema);
delete openAiCompatibleSchema.$schema;
delete openAiCompatibleSchema.$id;
delete openAiCompatibleSchema.title;
delete openAiCompatibleSchema.properties.missing_information.uniqueItems;
const buildAiRequestSource = fs.readFileSync(
  path.join(sourceDirectory, 'build-ai-request.js'),
  'utf8',
).replace(
  '__AI_RESPONSE_SCHEMA__',
  JSON.stringify(openAiCompatibleSchema),
);
const attachAiProviderResponseSource = fs.readFileSync(
  path.join(sourceDirectory, 'attach-ai-provider-response.js'),
  'utf8',
);
const buildAiCorrectionRequestSource = fs.readFileSync(
  path.join(sourceDirectory, 'build-ai-correction-request.js'),
  'utf8',
).replace(
  '__AI_RESPONSE_SCHEMA__',
  JSON.stringify(openAiCompatibleSchema),
);
const attachAiCorrectionResponseSource = fs.readFileSync(
  path.join(sourceDirectory, 'attach-ai-correction-response.js'),
  'utf8',
);
const validateAiResponseSource = fs.readFileSync(
  path.join(sourceDirectory, 'validate-ai-response.js'),
  'utf8',
);
const deterministicScoreSource = fs.readFileSync(
  path.join(sourceDirectory, 'calculate-deterministic-score.js'),
  'utf8',
);
const prepareAiReviewOutcomeSource = fs.readFileSync(
  path.join(sourceDirectory, 'prepare-ai-review-outcome.js'),
  'utf8',
);
const buildHubspotContactRequestSource = fs.readFileSync(
  path.join(sourceDirectory, 'build-hubspot-contact-request.js'),
  'utf8',
);
const buildHubspotDealRequestSource = fs.readFileSync(
  path.join(sourceDirectory, 'build-hubspot-deal-request.js'),
  'utf8',
);
const evaluateDealSearchResultsSource = fs.readFileSync(
  path.join(sourceDirectory, 'evaluate-deal-search-results.js'),
  'utf8',
);
const attachHubspotContactResponseSource = fs.readFileSync(
  path.join(sourceDirectory, 'attach-hubspot-contact-response.js'),
  'utf8',
);
const attachHubspotDealResponseSource = fs.readFileSync(
  path.join(sourceDirectory, 'attach-hubspot-deal-response.js'),
  'utf8',
);
const prepareHubspotCrmResponseSource = fs.readFileSync(
  path.join(sourceDirectory, 'prepare-hubspot-crm-response.js'),
  'utf8',
);
const prepareHubspotDealReviewSource = fs.readFileSync(
  path.join(sourceDirectory, 'prepare-hubspot-deal-review.js'),
  'utf8',
);
function booleanIfNode({ id, name, position, leftValue }) {
  return {
    parameters: {
      conditions: {
        options: {
          caseSensitive: true,
          leftValue: '',
          typeValidation: 'strict',
          version: 2,
        },
        conditions: [
          {
            id: `${id}-condition`,
            leftValue,
            rightValue: '',
            operator: {
              type: 'boolean',
              operation: 'true',
              singleValue: true,
            },
          },
        ],
        combinator: 'and',
      },
      options: {},
    },
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position,
    id,
    name,
  };
}

function codeNode({ id, name, position, jsCode }) {
  return {
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode,
    },
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position,
    id,
    name,
  };
}

function claimActionSwitchNode({ id, name, position }) {
  const actions = ['claimed', 'completed', 'processing', 'failed'];

  return {
    parameters: {
      rules: {
        values: actions.map((action) => ({
          conditions: {
            options: {
              caseSensitive: true,
              leftValue: '',
              typeValidation: 'strict',
              version: 2,
            },
            conditions: [
              {
                id: `${id}-${action}-condition`,
                leftValue: '={{ $json.claim_action }}',
                rightValue: action,
                operator: {
                  type: 'string',
                  operation: 'equals',
                },
              },
            ],
            combinator: 'and',
          },
          renameOutput: true,
          outputKey: action,
        })),
      },
      options: {},
    },
    type: 'n8n-nodes-base.switch',
    typeVersion: 3.2,
    position,
    id,
    name,
  };
}

function noOpNode({ id, name, position }) {
  return {
    parameters: {},
    type: 'n8n-nodes-base.noOp',
    typeVersion: 1,
    position,
    id,
    name,
  };
}

function executeWorkflowNode({ id, name, position, workflowId, workflowInputs }) {
  return {
    parameters: {
      source: 'database',
      workflowId: {
        __rl: true,
        value: workflowId,
        mode: 'id',
      },
      workflowInputs: workflowInputs ?? {
        mappingMode: 'defineBelow',
        value: {},
        matchingColumns: [],
        schema: [],
        attemptToConvertTypes: false,
        convertFieldsToString: true,
      },
      mode: 'once',
      options: {
        waitForSubWorkflow: true,
      },
    },
    type: 'n8n-nodes-base.executeWorkflow',
    typeVersion: 1.3,
    position,
    id,
    name,
  };
}

function mergeByPositionNode({ id, name, position }) {
  return {
    parameters: {
      mode: 'combine',
      combineBy: 'combineByPosition',
      options: {},
    },
    type: 'n8n-nodes-base.merge',
    typeVersion: 3.2,
    position,
    id,
    name,
  };
}

function openAiRequestNode({ id, name, position }) {
  return {
    parameters: {
      method: 'POST',
      url: 'https://api.openai.com/v1/chat/completions',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'openAiApi',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          {
            name: 'Content-Type',
            value: 'application/json',
          },
        ],
      },
      sendBody: true,
      contentType: 'raw',
      rawContentType: 'application/json',
      body: '={{ JSON.stringify($json) }}',
      options: {
        timeout: 60000,
      },
    },
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.3,
    position,
    id,
    name,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 30000,
    credentials: {
      openAiApi: {
        id: '4PtmLVMwWUnSv4NM',
        name: 'OpenAI account',
      },
    },
  };
}

function hubspotHttpRequestNode({
  id,
  name,
  position,
  method,
  url,
  body,
}) {
  const parameters = {
    method,
    url,
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'hubspotAppToken',
    sendHeaders: true,
    headerParameters: {
      parameters: [
        {
          name: 'Content-Type',
          value: 'application/json',
        },
      ],
    },
    options: {
      timeout: 60000,
    },
  };

  if (body !== undefined) {
    parameters.sendBody = true;
    parameters.contentType = 'raw';
    parameters.rawContentType = 'application/json';
    parameters.body = body;
  }

  return {
    parameters,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.3,
    position,
    id,
    name,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 30000,
    credentials: {
      hubspotAppToken: {
        id: 'gNSXBziHeO44pSta',
        name: 'HubspotConnectionSK',
      },
    },
  };
}

function hubspotNode({ id, name, position, parameters, alwaysOutputData }) {
  return {
    parameters: {
      authentication: 'appToken',
      ...parameters,
    },
    type: 'n8n-nodes-base.hubspot',
    typeVersion: 2.2,
    position,
    id,
    name,
    ...(alwaysOutputData ? { alwaysOutputData: true } : {}),
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 30000,
    credentials: {
      hubspotAppToken: {
        id: 'gNSXBziHeO44pSta',
        name: 'HubspotConnectionSK',
      },
    },
  };
}

const managedNodeIds = new Set([
  'asset001-normalize-validate',
  'asset001-normalize',
  'asset001-validate',
  'asset001-use-normalized-input',
  'asset001-is-valid',
  'asset001-valid-placeholder',
  'asset001-invalid-placeholder',
  'asset001-generate-idempotency-key',
  'asset001-claim-idempotency-key',
  'asset001-restore-claim-context',
  'asset001-is-new-claim',
  'asset001-is-completed-duplicate',
  'asset001-is-processing-duplicate',
  'asset001-return-previous-result',
  'asset001-return-in-progress',
  'asset001-safe-replay-required',
  'asset001-idempotency-config',
  'asset001-read-idempotency-config',
  'asset001-apply-idempotency-config',
  'asset001-is-idempotency-enabled',
  'asset001-prepare-idempotency-request',
  'asset001-execute-idempotency-subflow',
  'asset001-bypass-idempotency',
  'asset001-should-continue',
  'asset001-duplicate-handled',
  'asset001-prepare-hubspot-match-input',
  'asset001-execute-hubspot-match-subflow',
  'asset001-wait-for-idempotency',
  'asset001-merge-qualification-context',
  'asset001-determine-ai-invocation',
  'asset001-should-invoke-ai',
  'asset001-prepare-ai-qualification-input',
  'asset001-execute-ai-qualification-subflow',
  'asset001-execute-hubspot-crm-subflow',
  'asset001-route-without-ai',
]);

workflow.nodes = workflow.nodes.filter((node) => !managedNodeIds.has(node.id));
workflow.nodes.push(
  codeNode({
    id: 'asset001-normalize',
    name: 'Normalize Lead',
    position: [520, 300],
    jsCode: normalizationSource,
  }),
  codeNode({
    id: 'asset001-validate',
    name: 'Validate Lead',
    position: [780, 300],
    jsCode: validationSource,
  }),
  booleanIfNode({
    id: 'asset001-is-valid',
    name: 'Is Lead Valid?',
    position: [1040, 300],
    leftValue: '={{ $json.validation.is_valid }}',
  }),
  {
    parameters: {
      source: 'database',
      workflowId: {
        __rl: true,
        value: 'ASSET001Idempotency01',
        mode: 'id',
      },
      workflowInputs: {
        mappingMode: 'defineBelow',
        value: {},
        matchingColumns: [],
        schema: [],
        attemptToConvertTypes: false,
        convertFieldsToString: true,
      },
      mode: 'once',
      options: {
        waitForSubWorkflow: true,
      },
    },
    type: 'n8n-nodes-base.executeWorkflow',
    typeVersion: 1.3,
    position: [1560, 220],
    id: 'asset001-execute-idempotency-subflow',
    name: 'Execute Idempotency Guard',
  },
  booleanIfNode({
    id: 'asset001-should-continue',
    name: 'Continue After Idempotency?',
    position: [1820, 220],
    leftValue: '={{ $json.idempotency.should_continue }}',
  }),
  {
    ...executeWorkflowNode({
      id: 'asset001-execute-hubspot-match-subflow',
      name: 'Execute HubSpot Contact Match',
      position: [2340, 140],
      workflowId: 'ASSET001HubSpotMatch01',
    }),
    onError: 'continueRegularOutput',
  },
  codeNode({
    id: 'asset001-determine-ai-invocation',
    name: 'Determine AI Invocation',
    position: [2860, 140],
    jsCode: determineAiInvocationSource,
  }),
  booleanIfNode({
    id: 'asset001-should-invoke-ai',
    name: 'Invoke AI?',
    position: [3120, 140],
    leftValue: '={{ $json.continue_to_ai }}',
  }),
  executeWorkflowNode({
    id: 'asset001-execute-ai-qualification-subflow',
    name: 'Execute AI Qualification',
    position: [3380, 60],
    workflowId: 'ASSET001AIQualification01',
    workflowInputs: {
      mappingMode: 'defineBelow',
      value: {
        lead: "={{ $('Continue After Idempotency?').first().json.lead }}",
        hubspot_search_success:
          "={{ $('Execute HubSpot Contact Match').first().json.hubspot_search_success }}",
        crm_action: "={{ $('Execute HubSpot Contact Match').first().json.crm_action }}",
        crm_match: "={{ $('Execute HubSpot Contact Match').first().json.crm_match }}",
      },
      matchingColumns: [],
      schema: [
        {
          id: 'lead',
          displayName: 'lead',
          required: true,
          defaultMatch: false,
          display: true,
          canBeUsedToMatch: true,
          type: 'object',
        },
        {
          id: 'hubspot_search_success',
          displayName: 'hubspot_search_success',
          required: true,
          defaultMatch: false,
          display: true,
          canBeUsedToMatch: true,
          type: 'boolean',
        },
        {
          id: 'crm_action',
          displayName: 'crm_action',
          required: true,
          defaultMatch: false,
          display: true,
          canBeUsedToMatch: true,
          type: 'string',
        },
        {
          id: 'crm_match',
          displayName: 'crm_match',
          required: true,
          defaultMatch: false,
          display: true,
          canBeUsedToMatch: true,
          type: 'object',
        },
      ],
      attemptToConvertTypes: false,
      convertFieldsToString: false,
    },
  }),
  executeWorkflowNode({
    id: 'asset001-execute-hubspot-crm-subflow',
    name: 'Execute HubSpot Contact Deal',
    position: [3640, 60],
    workflowId: 'ASSET001HubSpotContactDeal01',
    workflowInputs: {
      mappingMode: 'defineBelow',
      value: {
        lead: "={{ $('Continue After Idempotency?').first().json.lead }}",
        crm_action:
          "={{ $('Execute HubSpot Contact Match').first().json.crm_action }}",
        crm_match:
          "={{ $('Execute HubSpot Contact Match').first().json.crm_match }}",
        ai_result: "={{ $('Execute AI Qualification').first().json }}",
        correlation_id:
          "={{ $('Execute Idempotency Guard').first().json.idempotency.stored_correlation_id }}",
        submission_reference:
          "={{ $('Execute Idempotency Guard').first().json.idempotency.key ?? $('Execute Idempotency Guard').first().json.idempotency.stored_correlation_id }}",
        received_at: '={{ $now.toISO() }}',
        source: 'portfolio_demo',
        hubspot_pipeline_id: 'default',
        hubspot_dealstage_id: 'appointmentscheduled',
      },
      matchingColumns: [],
      schema: [
        {
          id: 'lead',
          displayName: 'lead',
          required: true,
          defaultMatch: false,
          display: true,
          canBeUsedToMatch: true,
          type: 'object',
        },
        {
          id: 'crm_action',
          displayName: 'crm_action',
          required: true,
          defaultMatch: false,
          display: true,
          canBeUsedToMatch: true,
          type: 'string',
        },
        {
          id: 'crm_match',
          displayName: 'crm_match',
          required: true,
          defaultMatch: false,
          display: true,
          canBeUsedToMatch: true,
          type: 'object',
        },
        {
          id: 'ai_result',
          displayName: 'ai_result',
          required: true,
          defaultMatch: false,
          display: true,
          canBeUsedToMatch: true,
          type: 'object',
        },
        {
          id: 'correlation_id',
          displayName: 'correlation_id',
          required: true,
          defaultMatch: false,
          display: true,
          canBeUsedToMatch: true,
          type: 'string',
        },
        {
          id: 'submission_reference',
          displayName: 'submission_reference',
          required: true,
          defaultMatch: false,
          display: true,
          canBeUsedToMatch: true,
          type: 'string',
        },
        {
          id: 'received_at',
          displayName: 'received_at',
          required: true,
          defaultMatch: false,
          display: true,
          canBeUsedToMatch: true,
          type: 'string',
        },
        {
          id: 'source',
          displayName: 'source',
          required: true,
          defaultMatch: false,
          display: true,
          canBeUsedToMatch: true,
          type: 'string',
        },
        {
          id: 'hubspot_pipeline_id',
          displayName: 'hubspot_pipeline_id',
          required: true,
          defaultMatch: false,
          display: true,
          canBeUsedToMatch: true,
          type: 'string',
        },
        {
          id: 'hubspot_dealstage_id',
          displayName: 'hubspot_dealstage_id',
          required: true,
          defaultMatch: false,
          display: true,
          canBeUsedToMatch: true,
          type: 'string',
        },
      ],
      attemptToConvertTypes: false,
      convertFieldsToString: false,
    },
  }),
  noOpNode({
    id: 'asset001-valid-placeholder',
    name: 'Continue Qualification',
    position: [3900, 60],
  }),
  noOpNode({
    id: 'asset001-route-without-ai',
    name: 'Route Without AI',
    position: [3380, 220],
  }),
  noOpNode({
    id: 'asset001-duplicate-handled',
    name: 'Duplicate Submission Handled',
    position: [2080, 300],
  }),
  noOpNode({
    id: 'asset001-invalid-placeholder',
    name: 'Record Validation Failure',
    position: [1300, 380],
  }),
);

workflow.connections = {
  'Website Lead Form': {
    main: [[{ node: 'Normalize Lead', type: 'main', index: 0 }]],
  },
  'Normalize Lead': {
    main: [[{ node: 'Validate Lead', type: 'main', index: 0 }]],
  },
  'Validate Lead': {
    main: [[{ node: 'Is Lead Valid?', type: 'main', index: 0 }]],
  },
  'Is Lead Valid?': {
    main: [
      [{ node: 'Execute Idempotency Guard', type: 'main', index: 0 }],
      [{ node: 'Record Validation Failure', type: 'main', index: 0 }],
    ],
  },
  'Execute Idempotency Guard': {
    main: [[{ node: 'Continue After Idempotency?', type: 'main', index: 0 }]],
  },
  'Continue After Idempotency?': {
    main: [
      [{ node: 'Execute HubSpot Contact Match', type: 'main', index: 0 }],
      [{ node: 'Duplicate Submission Handled', type: 'main', index: 0 }],
    ],
  },
  'Execute HubSpot Contact Match': {
    main: [[{ node: 'Determine AI Invocation', type: 'main', index: 0 }]],
  },
  'Determine AI Invocation': {
    main: [[{ node: 'Invoke AI?', type: 'main', index: 0 }]],
  },
  'Invoke AI?': {
    main: [
      [{ node: 'Execute AI Qualification', type: 'main', index: 0 }],
      [{ node: 'Route Without AI', type: 'main', index: 0 }],
    ],
  },
  'Execute AI Qualification': {
    main: [[{ node: 'Execute HubSpot Contact Deal', type: 'main', index: 0 }]],
  },
  'Execute HubSpot Contact Deal': {
    main: [[{ node: 'Continue Qualification', type: 'main', index: 0 }]],
  },
};

const idempotencyWorkflow = {
  id: 'ASSET001Idempotency01',
  name: 'ASSET001 - Idempotency Guard',
  nodes: [
    {
      parameters: {
        inputSource: 'passthrough',
      },
      type: 'n8n-nodes-base.executeWorkflowTrigger',
      typeVersion: 1.2,
      position: [260, 300],
      id: 'asset001-idempotency-trigger',
      name: 'When Executed by Another Workflow',
    },
    {
      parameters: {
        resource: 'row',
        operation: 'get',
        dataTableId: {
          __rl: true,
          value: 'asset001_runtime_config',
          mode: 'name',
        },
        matchType: 'allConditions',
        filters: {
          conditions: [
            {
              keyName: 'key',
              condition: 'eq',
              keyValue: 'idempotency_enabled',
            },
          ],
        },
        returnAll: false,
        limit: 1,
      },
      type: 'n8n-nodes-base.dataTable',
      typeVersion: 1.1,
      position: [520, 300],
      id: 'asset001-subflow-read-config',
      name: 'Read Idempotency Configuration',
      alwaysOutputData: true,
      notesInFlow: true,
      notes: 'Reads idempotency_enabled from the asset001_runtime_config data table. Only Boolean false disables the guard.',
    },
    codeNode({
      id: 'asset001-subflow-apply-config',
      name: 'Apply Idempotency Configuration',
      position: [780, 300],
      jsCode: applyConfigSource,
    }),
    booleanIfNode({
      id: 'asset001-subflow-is-enabled',
      name: 'Is Idempotency Enabled?',
      position: [1040, 300],
      leftValue: '={{ $json.idempotency_enabled }}',
    }),
    codeNode({
      id: 'asset001-subflow-bypass',
      name: 'Bypass Idempotency',
      position: [1300, 440],
      jsCode: bypassSource,
    }),
    codeNode({
      id: 'asset001-subflow-generate-key',
      name: 'Generate Idempotency Key',
      position: [1300, 220],
      jsCode: idempotencySource,
    }),
    {
      parameters: {
        operation: 'executeQuery',
        query: [
          'INSERT INTO workflow_audit.idempotency_records AS existing',
          '  (idempotency_key, correlation_id, status)',
          "VALUES ($1, $2::uuid, 'processing')",
          'ON CONFLICT (idempotency_key) DO UPDATE',
          'SET updated_at = existing.updated_at',
          'RETURNING',
          "  CASE WHEN xmax = 0 THEN 'claimed' ELSE status END AS claim_action,",
          '  idempotency_key,',
          '  correlation_id AS stored_correlation_id,',
          '  status AS stored_status,',
          '  result_json AS previous_result,',
          '  error_json AS previous_error;',
        ].join('\n'),
        options: {
          queryReplacement:
            '={{ [$json.idempotency_key, $json.correlation_id] }}',
        },
      },
      type: 'n8n-nodes-base.postgres',
      typeVersion: 2.6,
      position: [1560, 220],
      id: 'asset001-subflow-claim-key',
      name: 'Claim Idempotency Key',
      credentials: {
        postgres: {
          id: 'asset001-audit-postgres',
          name: 'ASSET001 Audit PostgreSQL',
        },
      },
    },
    claimActionSwitchNode({
      id: 'asset001-subflow-route-claim-action',
      name: 'Route Claim Action',
      position: [1820, 220],
    }),
    codeNode({
      id: 'asset001-subflow-finalize-result',
      name: 'Finalize Idempotency Result',
      position: [2080, 220],
      jsCode: finalizeResultSource,
    }),
  ],
  pinData: {},
  connections: {
    'When Executed by Another Workflow': {
      main: [[{ node: 'Read Idempotency Configuration', type: 'main', index: 0 }]],
    },
    'Read Idempotency Configuration': {
      main: [[{ node: 'Apply Idempotency Configuration', type: 'main', index: 0 }]],
    },
    'Apply Idempotency Configuration': {
      main: [[{ node: 'Is Idempotency Enabled?', type: 'main', index: 0 }]],
    },
    'Is Idempotency Enabled?': {
      main: [
        [{ node: 'Generate Idempotency Key', type: 'main', index: 0 }],
        [{ node: 'Bypass Idempotency', type: 'main', index: 0 }],
      ],
    },
    'Generate Idempotency Key': {
      main: [[{ node: 'Claim Idempotency Key', type: 'main', index: 0 }]],
    },
    'Claim Idempotency Key': {
      main: [[{ node: 'Route Claim Action', type: 'main', index: 0 }]],
    },
    'Route Claim Action': {
      main: [
        [{ node: 'Finalize Idempotency Result', type: 'main', index: 0 }],
        [{ node: 'Finalize Idempotency Result', type: 'main', index: 0 }],
        [{ node: 'Finalize Idempotency Result', type: 'main', index: 0 }],
        [{ node: 'Finalize Idempotency Result', type: 'main', index: 0 }],
      ],
    },
  },
  active: false,
  settings: {
    executionOrder: 'v1',
    timezone: 'Europe/Kiev',
    callerPolicy: 'workflowsFromAList',
    callerIds: 'ASSET001Form01',
  },
  meta: {
    templateCredsSetupCompleted: true,
  },
  tags: [],
};

fs.writeFileSync(workflowPath, `${JSON.stringify(workflow, null, 2)}\n`);
fs.writeFileSync(
  idempotencyWorkflowPath,
  `${JSON.stringify(idempotencyWorkflow, null, 2)}\n`,
);

const hubspotMatchWorkflow = JSON.parse(
  fs.readFileSync(hubspotMatchWorkflowPath, 'utf8'),
);
const hubspotCodeSources = new Map([
  ['Evaluate Email Results', evaluateEmailResultsSource],
  ['Evaluate Phone Results', evaluatePhoneResultsSource],
  ['Produce Match Decision', produceMatchDecisionSource],
]);

for (const [nodeName, source] of hubspotCodeSources) {
  const node = hubspotMatchWorkflow.nodes.find(
    (candidate) => candidate.name === nodeName,
  );
  if (!node) {
    throw new Error(`${nodeName} was not found in ${hubspotMatchWorkflowPath}`);
  }
  node.parameters.jsCode = source;
}

fs.writeFileSync(
  hubspotMatchWorkflowPath,
  `${JSON.stringify(hubspotMatchWorkflow, null, 2)}\n`,
);

for (const node of hubspotMatchWorkflow.nodes) {
  if (node.type === 'n8n-nodes-base.hubspot') {
    node.retryOnFail = true;
    node.maxTries = 3;
    node.waitBetweenTries = 30000;
  }
}

fs.writeFileSync(
  hubspotMatchWorkflowPath,
  `${JSON.stringify(hubspotMatchWorkflow, null, 2)}\n`,
);

const aiQualificationWorkflow = {
  id: 'ASSET001AIQualification01',
  name: 'ASSET001 - AI Qualification',
  nodes: [
    {
      parameters: {
        inputSource: 'workflowInputs',
        workflowInputs: {
          values: [
            { name: 'lead', type: 'object' },
            { name: 'hubspot_search_success', type: 'boolean' },
            { name: 'crm_action', type: 'string' },
            { name: 'crm_match', type: 'object' },
          ],
        },
      },
      type: 'n8n-nodes-base.executeWorkflowTrigger',
      typeVersion: 1.2,
      position: [260, 300],
      id: 'asset001-ai-trigger',
      name: 'When Executed by Another Workflow',
    },
    codeNode({
      id: 'asset001-build-ai-request',
      name: 'Build AI Request',
      position: [520, 300],
      jsCode: buildAiRequestSource,
    }),
    openAiRequestNode({
      id: 'asset001-invoke-openai',
      name: 'Invoke OpenAI',
      position: [780, 300],
    }),
    codeNode({
      id: 'asset001-attach-ai-provider-response',
      name: 'Attach AI Provider Response',
      position: [1040, 300],
      jsCode: attachAiProviderResponseSource,
    }),
    codeNode({
      id: 'asset001-validate-ai-response',
      name: 'Validate AI Response',
      position: [1300, 300],
      jsCode: validateAiResponseSource,
    }),
    booleanIfNode({
      id: 'asset001-is-ai-response-valid',
      name: 'Is AI Response Valid?',
      position: [1560, 300],
      leftValue: '={{ $json.ai_validation.is_valid }}',
    }),
    codeNode({
      id: 'asset001-calculate-deterministic-score',
      name: 'Calculate Deterministic Score',
      position: [3120, 220],
      jsCode: deterministicScoreSource,
    }),
    codeNode({
      id: 'asset001-build-ai-correction-request',
      name: 'Build AI Correction Request',
      position: [1820, 380],
      jsCode: buildAiCorrectionRequestSource,
    }),
    openAiRequestNode({
      id: 'asset001-invoke-openai-correction',
      name: 'Invoke OpenAI Correction',
      position: [2080, 380],
    }),
    codeNode({
      id: 'asset001-attach-ai-correction-response',
      name: 'Attach AI Correction Response',
      position: [2340, 380],
      jsCode: attachAiCorrectionResponseSource,
    }),
    codeNode({
      id: 'asset001-validate-ai-correction-response',
      name: 'Validate AI Correction Response',
      position: [2600, 380],
      jsCode: validateAiResponseSource,
    }),
    booleanIfNode({
      id: 'asset001-is-ai-correction-valid',
      name: 'Is AI Correction Valid?',
      position: [2860, 380],
      leftValue: '={{ $json.ai_validation.is_valid }}',
    }),
    codeNode({
      id: 'asset001-prepare-ai-review-outcome',
      name: 'Prepare AI Review Outcome',
      position: [3120, 460],
      jsCode: prepareAiReviewOutcomeSource,
    }),
  ],
  pinData: {},
  connections: {
    'When Executed by Another Workflow': {
      main: [[
        { node: 'Build AI Request', type: 'main', index: 0 },
      ]],
    },
    'Build AI Request': {
      main: [[{ node: 'Invoke OpenAI', type: 'main', index: 0 }]],
    },
    'Invoke OpenAI': {
      main: [[{ node: 'Attach AI Provider Response', type: 'main', index: 0 }]],
    },
    'Attach AI Provider Response': {
      main: [[{ node: 'Validate AI Response', type: 'main', index: 0 }]],
    },
    'Validate AI Response': {
      main: [[{ node: 'Is AI Response Valid?', type: 'main', index: 0 }]],
    },
    'Is AI Response Valid?': {
      main: [
        [{ node: 'Calculate Deterministic Score', type: 'main', index: 0 }],
        [{ node: 'Build AI Correction Request', type: 'main', index: 0 }],
      ],
    },
    'Build AI Correction Request': {
      main: [[{ node: 'Invoke OpenAI Correction', type: 'main', index: 0 }]],
    },
    'Invoke OpenAI Correction': {
      main: [[{ node: 'Attach AI Correction Response', type: 'main', index: 0 }]],
    },
    'Attach AI Correction Response': {
      main: [[{ node: 'Validate AI Correction Response', type: 'main', index: 0 }]],
    },
    'Validate AI Correction Response': {
      main: [[{ node: 'Is AI Correction Valid?', type: 'main', index: 0 }]],
    },
    'Is AI Correction Valid?': {
      main: [
        [{ node: 'Calculate Deterministic Score', type: 'main', index: 0 }],
        [{ node: 'Prepare AI Review Outcome', type: 'main', index: 0 }],
      ],
    },
  },
  active: false,
  settings: {
    executionOrder: 'v1',
    timezone: 'Europe/Kiev',
    callerPolicy: 'workflowsFromAList',
    callerIds: 'ASSET001Form01',
  },
  meta: {
    templateCredsSetupCompleted: true,
  },
  tags: [],
};

fs.writeFileSync(
  aiQualificationWorkflowPath,
  `${JSON.stringify(aiQualificationWorkflow, null, 2)}\n`,
);

const hubspotCrmWorkflow = {
  id: 'ASSET001HubSpotContactDeal01',
  name: 'ASSET001 - HubSpot Contact Deal',
  nodes: [
    {
      parameters: {
        inputSource: 'workflowInputs',
        workflowInputs: {
          values: [
            { name: 'lead', type: 'object' },
            { name: 'crm_action', type: 'string' },
            { name: 'crm_match', type: 'object' },
            { name: 'ai_result', type: 'object' },
            { name: 'correlation_id', type: 'string' },
            { name: 'submission_reference', type: 'string' },
            { name: 'received_at', type: 'string' },
            { name: 'source', type: 'string' },
            { name: 'hubspot_pipeline_id', type: 'string' },
            { name: 'hubspot_dealstage_id', type: 'string' },
          ],
        },
      },
      type: 'n8n-nodes-base.executeWorkflowTrigger',
      typeVersion: 1.2,
      position: [260, 300],
      id: 'asset001-hubspot-crm-trigger',
      name: 'When Executed by Another Workflow',
    },
    codeNode({
      id: 'asset001-build-hubspot-deal-request',
      name: 'Build HubSpot Deal Request',
      position: [520, 300],
      jsCode: buildHubspotDealRequestSource,
    }),
    hubspotNode({
      id: 'asset001-search-existing-deal',
      name: 'Search Existing Deal',
      position: [780, 300],
      alwaysOutputData: true,
      parameters: {
        resource: 'deal',
        operation: 'search',
        returnAll: false,
        limit: 2,
        filterGroupsUi: {
          filterGroupsValues: [
            {
              filtersUi: {
                filterValues: [
                  {
                    propertyName: 'workflow_correlation_id|string',
                    operator: 'EQ',
                    value: '={{ $json.correlation_id }}',
                  },
                ],
              },
            },
          ],
        },
        additionalFields: {
          direction: 'DESCENDING',
          properties: [
            'dealname',
            'workflow_correlation_id',
            'original_submission_reference',
          ],
          sortBy: 'createdate',
        },
      },
    }),
    codeNode({
      id: 'asset001-evaluate-deal-search',
      name: 'Evaluate Deal Search',
      position: [1040, 300],
      jsCode: evaluateDealSearchResultsSource,
    }),
    booleanIfNode({
      id: 'asset001-can-write-crm',
      name: 'Can Write CRM?',
      position: [1300, 300],
      leftValue: '={{ $json.should_write }}',
    }),
    codeNode({
      id: 'asset001-build-hubspot-contact-request',
      name: 'Build HubSpot Contact Request',
      position: [1560, 220],
      jsCode: buildHubspotContactRequestSource,
    }),
    {
      parameters: {
        conditions: {
          options: {
            caseSensitive: true,
            leftValue: '',
            typeValidation: 'strict',
            version: 2,
          },
          conditions: [
            {
              id: 'asset001-use-contact-upsert-condition',
              leftValue: '={{ $json.contact_request.write_mode }}',
              rightValue: 'upsert_by_email',
              operator: {
                type: 'string',
                operation: 'equals',
              },
            },
          ],
          combinator: 'and',
        },
        options: {},
      },
      type: 'n8n-nodes-base.if',
      typeVersion: 2.2,
      position: [1820, 220],
      id: 'asset001-use-contact-upsert',
      name: 'Use Contact Upsert?',
    },
    hubspotNode({
      id: 'asset001-upsert-hubspot-contact',
      name: 'Upsert HubSpot Contact',
      position: [2080, 140],
      parameters: {
        resource: 'contact',
        operation: 'upsert',
        email: '={{ $json.contact_request.properties.email }}',
        additionalFields: {
          firstName:
            '={{ $json.contact_request.properties.firstname ?? "" }}',
          lastName:
            '={{ $json.contact_request.properties.lastname ?? "" }}',
          phoneNumber:
            '={{ $json.contact_request.properties.phone ?? "" }}',
          companyName:
            '={{ $json.contact_request.properties.company ?? "" }}',
          customPropertiesUi: {
            customPropertiesValues: [
              {
                property: 'source',
                value: '={{ $json.contact_request.properties.source }}',
              },
              {
                property: 'consent_status',
                value:
                  '={{ $json.contact_request.properties.consent_status }}',
              },
              {
                property: 'consent_timestamp',
                value:
                  '={{ $json.contact_request.properties.consent_timestamp }}',
              },
              {
                property: 'last_enquiry_date',
                value:
                  '={{ $json.contact_request.properties.last_enquiry_date }}',
              },
            ],
          },
        },
        options: {},
      },
    }),
    hubspotHttpRequestNode({
      id: 'asset001-update-hubspot-contact',
      name: 'Update HubSpot Contact',
      position: [2080, 300],
      method: 'PATCH',
      url:
        '=https://api.hubapi.com/crm/v3/objects/contacts/{{ $json.contact_request.contact_id }}',
      body:
        '={{ JSON.stringify({ properties: $json.contact_request.properties }) }}',
    }),
    codeNode({
      id: 'asset001-attach-contact-response',
      name: 'Attach Contact Response',
      position: [2340, 220],
      jsCode: attachHubspotContactResponseSource,
    }),
    {
      parameters: {
        conditions: {
          options: {
            caseSensitive: true,
            leftValue: '',
            typeValidation: 'strict',
            version: 2,
          },
          conditions: [
            {
              id: 'asset001-create-deal-condition',
              leftValue: '={{ $json.deal_match.action }}',
              rightValue: 'create',
              operator: {
                type: 'string',
                operation: 'equals',
              },
            },
          ],
          combinator: 'and',
        },
        options: {},
      },
      type: 'n8n-nodes-base.if',
      typeVersion: 2.2,
      position: [2600, 220],
      id: 'asset001-create-deal',
      name: 'Create Deal?',
    },
    hubspotNode({
      id: 'asset001-create-hubspot-deal',
      name: 'Create HubSpot Deal',
      position: [2860, 140],
      parameters: {
        resource: 'deal',
        operation: 'create',
        stage:
          '={{ $json.deal_request.create_properties.dealstage }}',
        additionalFields: {
          dealName:
            '={{ $json.deal_request.create_properties.dealname }}',
          pipeline:
            '={{ $json.deal_request.create_properties.pipeline }}',
          associatedVids: '={{ [$json.contact_result.contact_id] }}',
          customPropertiesUi: {
            customPropertiesValues: [
              {
                property: 'service_category',
                value:
                  '={{ $json.deal_request.create_properties.service_category }}',
              },
              {
                property: 'lead_score',
                value:
                  '={{ $json.deal_request.create_properties.lead_score ?? "" }}',
              },
              {
                property: 'qualification_status',
                value:
                  '={{ $json.deal_request.create_properties.qualification_status }}',
              },
              {
                property: 'urgency',
                value:
                  '={{ $json.deal_request.create_properties.urgency }}',
              },
              {
                property: 'problem_summary',
                value:
                  '={{ $json.deal_request.create_properties.problem_summary }}',
              },
              {
                property: 'ai_confidence',
                value:
                  '={{ $json.deal_request.create_properties.ai_confidence }}',
              },
              {
                property: 'qualification_explanation',
                value:
                  '={{ $json.deal_request.create_properties.qualification_explanation }}',
              },
              {
                property: 'workflow_correlation_id',
                value:
                  '={{ $json.deal_request.create_properties.workflow_correlation_id }}',
              },
              {
                property: 'original_submission_reference',
                value:
                  '={{ $json.deal_request.create_properties.original_submission_reference }}',
              },
            ],
          },
        },
      },
    }),
    hubspotNode({
      id: 'asset001-update-hubspot-deal',
      name: 'Update HubSpot Deal',
      position: [2860, 300],
      parameters: {
        resource: 'deal',
        operation: 'update',
        dealId: {
          __rl: true,
          value: '={{ $json.deal_match.deal_id }}',
          mode: 'id',
        },
        updateFields: {
          dealName:
            '={{ $json.deal_request.update_properties.dealname }}',
          customPropertiesUi: {
            customPropertiesValues: [
              {
                property: 'service_category',
                value:
                  '={{ $json.deal_request.update_properties.service_category }}',
              },
              {
                property: 'lead_score',
                value:
                  '={{ $json.deal_request.update_properties.lead_score ?? "" }}',
              },
              {
                property: 'qualification_status',
                value:
                  '={{ $json.deal_request.update_properties.qualification_status }}',
              },
              {
                property: 'urgency',
                value:
                  '={{ $json.deal_request.update_properties.urgency }}',
              },
              {
                property: 'problem_summary',
                value:
                  '={{ $json.deal_request.update_properties.problem_summary }}',
              },
              {
                property: 'ai_confidence',
                value:
                  '={{ $json.deal_request.update_properties.ai_confidence }}',
              },
              {
                property: 'qualification_explanation',
                value:
                  '={{ $json.deal_request.update_properties.qualification_explanation }}',
              },
              {
                property: 'workflow_correlation_id',
                value:
                  '={{ $json.deal_request.update_properties.workflow_correlation_id }}',
              },
              {
                property: 'original_submission_reference',
                value:
                  '={{ $json.deal_request.update_properties.original_submission_reference }}',
              },
            ],
          },
        },
      },
    }),
    codeNode({
      id: 'asset001-attach-deal-response',
      name: 'Attach Deal Response',
      position: [3120, 220],
      jsCode: attachHubspotDealResponseSource,
    }),
    booleanIfNode({
      id: 'asset001-associate-existing-deal',
      name: 'Associate Existing Deal?',
      position: [3380, 220],
      leftValue: "={{ $json.deal_result.action === 'update' }}",
    }),
    hubspotHttpRequestNode({
      id: 'asset001-associate-contact-deal',
      name: 'Associate Contact and Deal',
      position: [3640, 140],
      method: 'PUT',
      url:
        '=https://api.hubapi.com/crm/v4/objects/deals/{{ $json.deal_result.deal_id }}/associations/default/contacts/{{ $json.contact_result.contact_id }}',
    }),
    codeNode({
      id: 'asset001-prepare-hubspot-crm-response',
      name: 'Prepare HubSpot CRM Response',
      position: [3900, 220],
      jsCode: prepareHubspotCrmResponseSource,
    }),
    codeNode({
      id: 'asset001-prepare-deal-review',
      name: 'Prepare Deal Review',
      position: [1560, 420],
      jsCode: prepareHubspotDealReviewSource,
    }),
  ],
  pinData: {},
  connections: {
    'When Executed by Another Workflow': {
      main: [[{ node: 'Build HubSpot Deal Request', type: 'main', index: 0 }]],
    },
    'Build HubSpot Deal Request': {
      main: [[{ node: 'Search Existing Deal', type: 'main', index: 0 }]],
    },
    'Search Existing Deal': {
      main: [[{ node: 'Evaluate Deal Search', type: 'main', index: 0 }]],
    },
    'Evaluate Deal Search': {
      main: [[{ node: 'Can Write CRM?', type: 'main', index: 0 }]],
    },
    'Can Write CRM?': {
      main: [
        [{ node: 'Build HubSpot Contact Request', type: 'main', index: 0 }],
        [{ node: 'Prepare Deal Review', type: 'main', index: 0 }],
      ],
    },
    'Build HubSpot Contact Request': {
      main: [[{ node: 'Use Contact Upsert?', type: 'main', index: 0 }]],
    },
    'Use Contact Upsert?': {
      main: [
        [{ node: 'Upsert HubSpot Contact', type: 'main', index: 0 }],
        [{ node: 'Update HubSpot Contact', type: 'main', index: 0 }],
      ],
    },
    'Upsert HubSpot Contact': {
      main: [[{ node: 'Attach Contact Response', type: 'main', index: 0 }]],
    },
    'Update HubSpot Contact': {
      main: [[{ node: 'Attach Contact Response', type: 'main', index: 0 }]],
    },
    'Attach Contact Response': {
      main: [[{ node: 'Create Deal?', type: 'main', index: 0 }]],
    },
    'Create Deal?': {
      main: [
        [{ node: 'Create HubSpot Deal', type: 'main', index: 0 }],
        [{ node: 'Update HubSpot Deal', type: 'main', index: 0 }],
      ],
    },
    'Create HubSpot Deal': {
      main: [[{ node: 'Attach Deal Response', type: 'main', index: 0 }]],
    },
    'Update HubSpot Deal': {
      main: [[{ node: 'Attach Deal Response', type: 'main', index: 0 }]],
    },
    'Attach Deal Response': {
      main: [[{ node: 'Associate Existing Deal?', type: 'main', index: 0 }]],
    },
    'Associate Existing Deal?': {
      main: [
        [{ node: 'Associate Contact and Deal', type: 'main', index: 0 }],
        [{ node: 'Prepare HubSpot CRM Response', type: 'main', index: 0 }],
      ],
    },
    'Associate Contact and Deal': {
      main: [[{ node: 'Prepare HubSpot CRM Response', type: 'main', index: 0 }]],
    },
  },
  active: false,
  settings: {
    executionOrder: 'v1',
    timezone: 'Europe/Kiev',
    callerPolicy: 'workflowsFromAList',
    callerIds: 'ASSET001Form01',
  },
  meta: {
    templateCredsSetupCompleted: true,
  },
  tags: [],
};

fs.writeFileSync(
  hubspotCrmWorkflowPath,
  `${JSON.stringify(hubspotCrmWorkflow, null, 2)}\n`,
);
