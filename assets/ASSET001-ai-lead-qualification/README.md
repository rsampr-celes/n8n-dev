# ASSET001 — AI Lead Qualification

This asset demonstrates a native n8n website form that will feed the AI lead
qualification and CRM-routing workflow.

## Current implementation

The current workflow contains only the `n8n Form Trigger`. It captures:

- Full name and work email
- Optional phone, company, website, and country
- Requested service and project description
- Estimated budget and expected timeline
- Required consent

The public form warns users to submit synthetic demonstration data only.
Downstream validation, AI qualification, HubSpot, Slack, and audit storage are
intentionally not implemented yet.

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

