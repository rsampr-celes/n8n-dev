# ASSET001 — AI Lead Qualification

This asset demonstrates a native n8n website form that will feed the AI lead
qualification and CRM-routing workflow.

## Current implementation

The workflow captures:

- Separate first name, last name, and work email
- Optional phone, company, website, and country
- Requested service and project description
- Estimated budget and expected timeline
- Required consent

The form feeds separate **Normalize Lead** and **Validate Lead** Code nodes.
Native JavaScript first produces only `{ lead }`. Ajv then validates that lead
and produces only `{ validation }`. An IF node routes valid and invalid leads
separately.

Valid leads now pass through a configurable idempotency sub-workflow before
qualification:

- **Use Normalized Input** waits for a successful validation signal, then emits
  the original `{ lead }` normalization branch unchanged.
- **Execute Idempotency Guard** calls `ASSET001 - Idempotency Guard`.
- The sub-workflow reads the `idempotency_enabled` row from the
  `asset001_runtime_config` n8n Data Table.
- Only an explicit Boolean `false` disables idempotency. A missing or malformed
  configuration row fails safe with idempotency enabled.
- The sub-workflow hashes normalized email and phone, creates its operational
  correlation ID, claims the key in PostgreSQL, and maps
  `claimed`, `completed`, `processing`, and `failed` states to a stable outcome.
- When disabled, **Bypass Idempotency** marks the guard as bypassed and allows
  qualification to continue without a database write.
- Only new claims continue to qualification when the guard is enabled.
  Existing claims stop at **Duplicate Submission Handled** with the stored
  result, in-progress state, or safe-replay requirement in the item data.
- **Record Validation Failure** is the boundary for restricted audit storage.

No AI or CRM node can currently receive an invalid lead.

A separate **HubSpot Contact Match** sub-workflow now implements the CRM lookup
boundary:

- It receives the normalized workflow JSON without re-validating it.
- It searches contacts by exact normalized email.
- It searches the standard HubSpot `phone` property only when the email search
  returns no contacts and the normalized input contains a phone.
- It retrieves at most two results from either search, which distinguishes no
  match, a unique match, and an ambiguous match without loading unnecessary
  contacts.
- It returns only a deterministic `crm_match` object containing the `create`,
  `update`, or `review` decision. It does not accumulate or return the
  normalized lead.

Validation inside the sub-workflow, audit writes, retries, and a centralized
error handler are intentionally deferred. A HubSpot node failure therefore
fails the sub-workflow execution at this stage.

The main workflow calls this sub-workflow after a new idempotency claim.
**Wait for Idempotency** receives the original normalized item on input 1 and
the successful idempotency control signal on input 2. It waits for both, outputs
input 1 unchanged, and passes that same normalized JSON to **Execute HubSpot
Contact Match**. The matching result then continues through the existing
**Continue Qualification** boundary.

The Postgres node expects an n8n credential named
`ASSET001 Audit PostgreSQL`. Apply
`database/audit/sql/001_create_idempotency_records.sql` before running the
workflow. The credential must point to the same database where that migration
was applied.

## Local workflow

Workflow source:
`workflows/ASSET001-website-lead-form.json`

Idempotency sub-workflow:
`workflows/ASSET001-idempotency-guard.json`

HubSpot contact-match sub-workflow:
`workflows/ASSET001-hubspot-contact-match.json`

The workflow exports use stable IDs. Import the sub-workflows before the parent
workflow, then publish the required workflows. Each called child must remain
published because n8n only permits **Execute Sub-workflow** to call a published
workflow.

The HubSpot workflow uses the n8n Service Key credential named
`HubspotConnectionSK`. Store normalized E.164 values in HubSpot's standard
`phone` property whenever contacts are created or updated so the exact-match
fallback remains deterministic.

Create an n8n Data Table named `asset001_runtime_config` with these columns and
row:

| key | enabled |
| --- | --- |
| `idempotency_enabled` | `true` |

The exported sub-workflow resolves the Data Table by name, so its internal ID
may differ between n8n environments. Change the row's `enabled` Boolean directly
in the Data Tables UI to enable or bypass idempotency without publishing either
workflow or restarting n8n. Do not unpublish the child to disable the feature.

Open <http://localhost:5681>, review the form, and use the Form Trigger's test
URL while developing.

An importable Postman Collection is available at
`postman/ASSET001-lead-form.postman_collection.json`. Run requests 01 and 02 in
order to create and then replay the same idempotency claim. The collection uses
multipart form field IDs (`field-0` through `field-11`) because those are the
wire-level names generated by the n8n Form Trigger.

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
src/normalize-lead.js
src/validate-lead.js
src/apply-idempotency-config.js
src/generate-idempotency-key.js
src/finalize-idempotency-result.js
src/bypass-idempotency.js
src/evaluate-email-results.js
src/evaluate-phone-results.js
src/produce-match-decision.js
scripts/build-workflow.mjs
tests/validation.test.mjs
tests/hubspot-contact-match.test.mjs
tests/validation-scenarios.md
examples/valid-lead.json
examples/invalid-lead.json
workflows/ASSET001-website-lead-form.json
workflows/ASSET001-idempotency-guard.json
workflows/ASSET001-hubspot-contact-match.json
postman/ASSET001-lead-form.postman_collection.json
```
