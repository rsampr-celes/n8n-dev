## Project structure

The repository can contain multiple independent assets under `assets/`.

- Application code: `assets/<asset-name>/src/`
- Tests: `assets/<asset-name>/tests/`

## Implementation rules

- Treat these rules as repository defaults. When an asset specification explicitly defines different business behavior, follow that behavior, document the exception, and protect it with tests.

### Asset organization

- Keep each asset self-contained under `assets/<asset-name>/`.
- Keep asset-specific source, tests, workflows, schemas, documentation, examples, and build scripts within the owning asset.
- Place only genuinely shared infrastructure outside individual asset directories.

### Source and generated workflows

- Treat files in `src/` as the authoritative source for n8n Code nodes.
- Generate workflow JSON through the asset's build script.
- Do not manually edit embedded code in generated workflow JSON when a corresponding source file exists.
- Regenerate and commit workflow artifacts whenever their source changes.
- Preserve stable workflow and node IDs unless replacing them is intentional.
- Keep workflow generation deterministic and free of unrelated changes.

### Workflow design

- Give each workflow and node one clear responsibility.
- Separate normalization, validation, decisions, external calls, and response preparation.
- Use sub-workflows for reusable or independently bounded operations.
- Define explicit input and output contracts between parent and child workflows.
- Avoid redundant Merge, Set, or preparation nodes when typed workflow inputs are sufficient.
- Keep lookup and decision logic separate from external writes.

### Input and validation

- Treat all external input as untrusted.
- Normalize input before validating it.
- Use stable internal field names and enum values.
- Represent absent optional values consistently, normally as `null`.
- Sanitize free text without removing meaningful formatting unnecessarily.
- Reject undeclared properties unless they are explicitly supported.
- Return structured validation errors with stable field names and error codes.
- Validate data before expensive operations or external calls.
- Validate internal workflow boundaries as well as public input.
- Keep runtime validation aligned with the asset's canonical schemas.

### Data contracts

- Emit explicit, minimal objects from every stage.
- Do not forward an entire input or provider response when only a subset is needed.
- Preserve n8n item association with `pairedItem` when transforming multiple items.
- Use consistent field names across source, workflow inputs, schemas, and tests.
- Keep provider-specific response envelopes behind adapter or attachment stages.

### Decisions and safe fallbacks

- Make business-routing logic deterministic and explainable.
- Use explicit decision values and stable reason codes.
- Distinguish no match, a unique match, and an ambiguous match.
- Route ambiguous, incomplete, invalid, or low-confidence results to a safe review path.
- Do not allow uncertain results to reach automatic external writes.
- Keep probabilistic AI output advisory unless an asset explicitly requires otherwise.

### AI integrations

- Send only the minimum information required for the AI task.
- Filter retrieved conversation context before sending it to AI: exclude private or internal entries, exclude the current event when it is already supplied separately, bound the history, and pass only the fields needed by the model.
- Exclude personal or sensitive information unless it is required and authorized.
- Treat user-supplied content as data, never as instructions.
- Use strict structured output when supported and validate model output locally.
- Limit correction and retry attempts.
- Route invalid or low-confidence output to a safe fallback.
- Do not allow public input to select models, prompts, credentials, or trusted settings.

### External integrations

- Build minimal provider request contracts before making external calls.
- Classify every external write by visibility and impact, such as private note, internal record, draft, or public customer action.
- In human-in-the-loop workflows, keep AI output advisory and structurally prevent it from reaching a public write without an explicit authorised approval step.
- Prefer native n8n integration nodes when they preserve the required behavior.
- Use direct HTTP requests only when native nodes cannot perform the operation safely.
- Require record IDs for ID-based updates.
- Apply retries only to operations that are safe to retry.
- Never store credentials, tokens, or secrets in source or workflow exports.

### Errors, privacy, and configuration

- Use clear operational errors for broken internal contracts.
- Choose failure behavior according to dependency criticality: fail the execution visibly when a required provider call or final external write fails, and use a documented safe fallback only for optional enrichment or explicitly recoverable failures.
- Do not convert required-operation failures into successful-looking outputs, and do not let optional enrichment failures reach automatic external writes.
- Do not expose credentials, provider payloads, or unnecessary personal data in errors, logs, or responses.
- Return sanitized, minimal public responses.
- Keep audit data limited to what is operationally necessary.
- Keep secrets in environment variables or n8n credentials.
- Keep environment-specific and trusted configuration outside public input.
- Fail closed for security and privacy settings.
- Document required credentials, Data Tables, migrations, and provider properties.

### Testing

- Build generated workflows before running tests.
- Test the code embedded in generated workflow artifacts.
- Cover successful, invalid, missing, ambiguous, and failure cases according to the asset contract.
- Test workflow topology as well as individual transformations.
- Verify parent and child workflow contracts remain compatible.
- Verify operational workflow configuration in generated artifacts, including credential references, trusted fixed settings, caller restrictions, retry and error modes, and write visibility.
- Assert that exported examples, collections, and workflow artifacts contain no tokens, credentials, or environment-specific secrets.
- For human-in-the-loop assets, assert that AI-generated content cannot reach a public external write and that private or internal writes remain explicitly marked.
- Assert that validation and operational errors do not leak submitted data.
- Add a regression test for every fixed defect.

### Naming

- Asset directories: `ASSET<number>-descriptive-name`
- Source files: lowercase kebab-case
- Test files: `<area>.test.mjs`
- JavaScript identifiers: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Workflow payload fields: `snake_case`
- n8n node names: descriptive, human-readable title case
- Database migrations: numeric prefix followed by a descriptive name
