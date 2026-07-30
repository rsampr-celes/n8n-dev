# HubSpot contact/deal request and response

`ASSET001 - HubSpot Contact Deal` is called after contact matching and AI
qualification. The parent maps typed inputs directly from earlier workflow
nodes; it does not merge or carry an accumulated item.

## Child input contract

| Input | Type | Source |
|---|---|---|
| `lead` | object | `Continue After Idempotency?` |
| `crm_action` | string | `Execute HubSpot Contact Match` |
| `crm_match` | object | `Execute HubSpot Contact Match` |
| `ai_result` | object | `Execute AI Qualification` |
| `correlation_id` | string | Idempotency result |
| `submission_reference` | string | Idempotency key, or correlation ID when bypassed |
| `received_at` | string | Parent invocation timestamp |
| `source` | string | Trusted constant `portfolio_demo` |
| `hubspot_pipeline_id` | string | Trusted pipeline configuration |
| `hubspot_dealstage_id` | string | Trusted initial-stage configuration |

`Build HubSpot CRM Request` validates this contract and emits only `contact`,
`deal`, and `correlation_id`.

## Contact request

```json
{
  "action": "create",
  "contact_id": null,
  "properties": {
    "firstname": "Jane",
    "lastname": "Smith",
    "email": "jane@example.com",
    "phone": "+15550102000",
    "company": "Northwind Services",
    "source": "portfolio_demo",
    "consent_status": "true",
    "consent_timestamp": "2026-07-30T12:00:00.000Z",
    "last_enquiry_date": "2026-07-30T12:00:00.000Z"
  }
}
```

Blank optional values are omitted. An update requires the contact ID returned
by the match workflow, including when the match was found by phone. This avoids
an email-based upsert creating a second contact.

## Deal request and idempotent update

Before any write, the child searches deals by the immutable
`workflow_correlation_id` and requests at most two results:

- No deal: create.
- One deal: update that deal.
- More than one deal: return review without writing either record.

Create properties include the configured pipeline and initial stage. Update
properties omit them so replay does not move an existing deal. Invalid AI
output is still recorded as a human-review deal using deterministic fallbacks.

## Association

After both records succeed, the child uses HubSpot's default deal-to-contact
association endpoint. Repeating the association does not create a duplicate.

## Success response

```json
{
  "hubspot_write_success": true,
  "correlation_id": "d4ba95e6-9d6f-4d57-b836-40b5e125d17d",
  "contact": {
    "action": "create",
    "contact_id": "20"
  },
  "deal": {
    "action": "create",
    "deal_id": "30",
    "associated_contact_id": "20"
  }
}
```

## Ambiguous-deal response

```json
{
  "hubspot_write_success": false,
  "correlation_id": "d4ba95e6-9d6f-4d57-b836-40b5e125d17d",
  "contact": null,
  "deal": {
    "action": "review",
    "deal_id": null,
    "candidate_deal_ids": ["30", "31"],
    "review_reason": "multiple_deals_for_correlation_id"
  }
}
```

HTTP failures use three attempts with a 30-second wait and fail the subflow
after the final attempt. Raw HubSpot records are not returned to the parent.

## Required HubSpot schema

Contact properties:

- `firstname`, `lastname`, `email`, `phone`, `company`
- `source`, `consent_status`, `consent_timestamp`, `last_enquiry_date`

Deal properties:

- `dealname`, `pipeline`, `dealstage`
- `service_category`, `lead_score`, `qualification_status`, `urgency`
- `problem_summary`, `ai_confidence`, `qualification_explanation`
- `workflow_correlation_id`, `original_submission_reference`

The exported parent uses pipeline `default` and initial stage
`appointmentscheduled`. Change these trusted mappings if the target account
uses different IDs.
