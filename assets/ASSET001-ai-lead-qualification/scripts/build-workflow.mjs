import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import standaloneCode from 'ajv/dist/standalone/index.js';

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
const schemaPath = path.join(assetDirectory, 'schemas', 'lead-submission.schema.json');
const sourceDirectory = path.join(assetDirectory, 'src');
const validationSourcePath = path.join(sourceDirectory, 'normalize-and-validate.js');

const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
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
const marker = '/*__AJV_STANDALONE_VALIDATOR__*/';

if (!validationSource.includes(marker)) {
  throw new Error(`Standalone-validator marker was not found in ${validationSourcePath}`);
}

const ajv = new Ajv({
  allErrors: true,
  strict: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
  code: { source: true },
});
addFormats(ajv);
const compiledValidator = ajv.compile(schema);
const generatedModule = standaloneCode(ajv, compiledValidator)
  .replaceAll('require("ajv/', 'require("asset001-ajv/')
  .replaceAll('require("ajv-formats/', 'require("asset001-ajv-formats/');

const embeddedValidator = [
  'const validatorModule = { exports: {} };',
  '((module, exports, require) => {',
  generatedModule,
  '})(validatorModule, validatorModule.exports, require);',
  'const validateLead = validatorModule.exports;',
].join('\n');

const validationCode = validationSource.replace(marker, embeddedValidator);

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

const managedNodeIds = new Set([
  'asset001-normalize-validate',
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
]);

workflow.nodes = workflow.nodes.filter((node) => !managedNodeIds.has(node.id));
workflow.nodes.push(
  codeNode({
    id: 'asset001-normalize-validate',
    name: 'Normalize and Validate Lead',
    position: [520, 300],
    jsCode: validationCode,
  }),
  booleanIfNode({
    id: 'asset001-is-valid',
    name: 'Is Lead Valid?',
    position: [780, 300],
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
    position: [1040, 220],
    id: 'asset001-execute-idempotency-subflow',
    name: 'Execute Idempotency Guard',
  },
  booleanIfNode({
    id: 'asset001-should-continue',
    name: 'Continue After Idempotency?',
    position: [1300, 220],
    leftValue: '={{ $json.idempotency.should_continue }}',
  }),
  {
    parameters: {
      mode: 'chooseBranch',
      numberInputs: 2,
      chooseBranchMode: 'waitForAll',
      output: 'specifiedInput',
      useDataOfInput: 1,
    },
    type: 'n8n-nodes-base.merge',
    typeVersion: 3.2,
    position: [1560, 140],
    id: 'asset001-wait-for-idempotency',
    name: 'Wait for Idempotency',
  },
  {
    parameters: {
      source: 'database',
      workflowId: {
        __rl: true,
        value: 'ASSET001HubSpotMatch01',
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
    position: [1820, 140],
    id: 'asset001-execute-hubspot-match-subflow',
    name: 'Execute HubSpot Contact Match',
  },
  noOpNode({
    id: 'asset001-valid-placeholder',
    name: 'Continue Qualification',
    position: [2080, 140],
  }),
  noOpNode({
    id: 'asset001-duplicate-handled',
    name: 'Duplicate Submission Handled',
    position: [1560, 300],
  }),
  noOpNode({
    id: 'asset001-invalid-placeholder',
    name: 'Record Validation Failure',
    position: [1040, 380],
  }),
);

workflow.connections = {
  'Website Lead Form': {
    main: [[{ node: 'Normalize and Validate Lead', type: 'main', index: 0 }]],
  },
  'Normalize and Validate Lead': {
    main: [[{ node: 'Is Lead Valid?', type: 'main', index: 0 }]],
  },
  'Is Lead Valid?': {
    main: [
      [
        { node: 'Execute Idempotency Guard', type: 'main', index: 0 },
        { node: 'Wait for Idempotency', type: 'main', index: 0 },
      ],
      [{ node: 'Record Validation Failure', type: 'main', index: 0 }],
    ],
  },
  'Execute Idempotency Guard': {
    main: [[{ node: 'Continue After Idempotency?', type: 'main', index: 0 }]],
  },
  'Continue After Idempotency?': {
    main: [
      [{ node: 'Wait for Idempotency', type: 'main', index: 1 }],
      [{ node: 'Duplicate Submission Handled', type: 'main', index: 0 }],
    ],
  },
  'Wait for Idempotency': {
    main: [[{ node: 'Execute HubSpot Contact Match', type: 'main', index: 0 }]],
  },
  'Execute HubSpot Contact Match': {
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
