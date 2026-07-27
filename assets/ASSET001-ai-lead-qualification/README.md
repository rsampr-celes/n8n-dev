# ASSET001 — AI Lead Qualification

This asset demonstrates a native n8n website form that will feed the AI lead
qualification and CRM-routing workflow.

## Current implementation

The workflow captures:

- Full name and work email
- Optional phone, company, website, and country
- Requested service and project description
- Estimated budget and expected timeline
- Required consent

The form feeds a **Normalize and Validate Lead** Code node. Native JavaScript
normalizes submitted values, Ajv validates the canonical object against the
versioned JSON Schema, and an IF node routes valid and invalid leads separately.

The two terminal nodes are intentional placeholders:

- **Valid Lead - Continue Qualification** is the boundary for the next
  idempotency and AI-qualification work.
- **Record Validation Failure** is the boundary for restricted audit storage.

No AI or CRM node can currently receive an invalid lead.

## Local workflow

Workflow source:
`workflows/ASSET001-website-lead-form.json`

The workflow is imported into the shared local n8n instance in an inactive
state. Open <http://localhost:5681>, review the form, and use the Form Trigger's
test URL while developing.

The configured production path is:

```text
/form/asset001-lead-qualification
```

The production form becomes available only after the workflow is activated.

## Build and test

The repository build compiles the schema with Ajv standalone mode and embeds
the generated validator in the workflow. This is necessary because n8n's Code
runner blocks the dynamic code generation used by `Ajv.compile()`.

The custom n8n image pins aliased Ajv runtime helpers without replacing n8n's
own dependencies. Compose allowlists those aliases, plus Node's `crypto`
module, for the JavaScript Code node.

```powershell
npm install
npm test
docker compose up -d --build
```

`npm test` regenerates the exported workflow by embedding
`schemas/lead-submission.schema.json` into the Code node, then executes the
V01–V20 contract suite against that embedded code.

If the workflow already exists in n8n, import the regenerated JSON and choose
to overwrite the existing workflow.

## Files

```text
schemas/lead-submission.schema.json
schemas/validation-error.schema.json
src/normalize-and-validate.js
scripts/build-workflow.mjs
tests/validation.test.mjs
tests/validation-scenarios.md
examples/valid-lead.json
examples/invalid-lead.json
workflows/ASSET001-website-lead-form.json
```
