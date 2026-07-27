import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import standaloneCode from 'ajv/dist/standalone/index.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const assetDirectory = path.resolve(scriptDirectory, '..');
const workflowPath = path.join(assetDirectory, 'workflows', 'ASSET001-website-lead-form.json');
const schemaPath = path.join(assetDirectory, 'schemas', 'lead-submission.schema.json');
const sourcePath = path.join(assetDirectory, 'src', 'normalize-and-validate.js');

const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const source = fs.readFileSync(sourcePath, 'utf8');
const marker = '/*__AJV_STANDALONE_VALIDATOR__*/';

if (!source.includes(marker)) {
  throw new Error(`Standalone-validator marker was not found in ${sourcePath}`);
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

const jsCode = source.replace(marker, embeddedValidator);
const managedNodeIds = new Set([
  'asset001-normalize-validate',
  'asset001-is-valid',
  'asset001-valid-placeholder',
  'asset001-invalid-placeholder',
]);

workflow.nodes = workflow.nodes.filter((node) => !managedNodeIds.has(node.id));
workflow.nodes.push(
  {
    parameters: { mode: 'runOnceForAllItems', jsCode },
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [520, 300],
    id: 'asset001-normalize-validate',
    name: 'Normalize and Validate Lead',
  },
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
            id: 'asset001-validation-condition',
            leftValue: '={{ $json.validation.is_valid }}',
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
    position: [780, 300],
    id: 'asset001-is-valid',
    name: 'Is Lead Valid?',
  },
  {
    parameters: {},
    type: 'n8n-nodes-base.noOp',
    typeVersion: 1,
    position: [1040, 220],
    id: 'asset001-valid-placeholder',
    name: 'Valid Lead - Continue Qualification',
  },
  {
    parameters: {},
    type: 'n8n-nodes-base.noOp',
    typeVersion: 1,
    position: [1040, 380],
    id: 'asset001-invalid-placeholder',
    name: 'Record Validation Failure',
  },
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
      [{ node: 'Valid Lead - Continue Qualification', type: 'main', index: 0 }],
      [{ node: 'Record Validation Failure', type: 'main', index: 0 }],
    ],
  },
};

fs.writeFileSync(workflowPath, `${JSON.stringify(workflow, null, 2)}\n`);
