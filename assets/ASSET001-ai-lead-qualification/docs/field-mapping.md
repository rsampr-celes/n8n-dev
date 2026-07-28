# ASSET001 field mapping

This mapping reflects the current implementation in:

- `workflows/ASSET001-website-lead-form.json`
- `src/normalize-and-validate.js`
- `schemas/lead-submission.schema.json`
- `src/generate-idempotency-key.js`

## FormItem → Validate & Normalize

| FormItem | Form label | Type | Form required | Normalized output | Normalize rule | Blank handling | Schema validation |
|---|---|---|---:|---|---|---|---|
| `full_name` | Full name | text | Yes | `lead.full_name` | Trim leading/trailing whitespace and collapse whitespace runs to one space. | Omit normalized field. | Required string; length 1–120. |
| `email` | Work email | email | Yes | `lead.email_normalized` | Trim and lowercase. | Omit normalized field. | Required string; email format; maximum 254 characters. |
| `phone` | Phone number | text | No | `lead.phone_normalized` | Trim, then remove whitespace, parentheses, periods, and hyphens. | Set to `null`. | String or `null`; when present, must match `^\+[1-9]\d{6,14}$`. |
| `company` | Company | text | No | `lead.company` | Trim and collapse whitespace runs to one space. | Set to `null`. | String or `null`; maximum 160 characters. |
| `company_website` | Company website | text | No | `lead.company_website` | Trim; if URL parsing succeeds, remove the fragment and serialize the URL. If parsing fails, keep the trimmed value for validation to reject. | Set to `null`. | String or `null`; URI format; must start with `http://` or `https://`; maximum 2,048 characters. |
| `service_requested` | Service requested | dropdown | No | `lead.service_requested` | Normalize whitespace, then map the selected label to the canonical value shown below. An unknown nonblank value passes through and fails enum validation. | Set to `null`. | String or `null`; canonical enum only. |
| `message` | Tell us about your requirement | textarea | Yes | `lead.message_sanitized` | Convert CRLF/CR line endings to LF, remove disallowed control characters, and trim. | Omit normalized field. | Required string; length 1–5,000. |
| `budget` | Estimated budget | dropdown | No | `lead.budget_band` | Normalize whitespace, then map the selected label to the canonical value shown below. An unknown nonblank value passes through and fails enum validation. | Set to `null`. | String or `null`; canonical enum only. |
| `timeline` | Expected timeline | dropdown | No | `lead.timeline_band` | Normalize whitespace, then map the selected label to the canonical value shown below. An unknown nonblank value passes through and fails enum validation. | Set to `null`. | String or `null`; canonical enum only. |
| `country` | Country | text | No | `lead.country` | Trim and collapse whitespace runs to one space. | Set to `null`. | String or `null`; maximum 100 characters. |
| `consent` | Consent | checkbox | Yes | `lead.consent` | `true` is produced only for Boolean `true`, the exact consent text, or a one-element array containing that exact text. All other supplied values become `false`. | Omit normalized field when input is `undefined` or `null`. | Required; value must be Boolean `true`. |

### Canonical option mappings

| FormItem | Submitted option | Normalized value |
|---|---|---|
| `service_requested` | `API integration` | `api_integration` |
| `service_requested` | `CRM automation` | `crm_automation` |
| `service_requested` | `AI workflow` | `ai_workflow` |
| `service_requested` | `Data integration` | `data_integration` |
| `service_requested` | `Other` | `other` |
| `budget` | `Under $2,500` | `under_2500` |
| `budget` | `$2,500–$5,000` | `2500_5000` |
| `budget` | `$5,000–$10,000` | `5000_10000` |
| `budget` | `Over $10,000` | `over_10000` |
| `budget` | `Not decided` | `not_decided` |
| `timeline` | `Immediately` | `immediately` |
| `timeline` | `Within one month` | `within_one_month` |
| `timeline` | `1–3 months` | `one_to_three_months` |
| `timeline` | `Later` | `later` |
| `timeline` | `Not decided` | `not_decided` |

## Normalized fields → Idempotency

The guard generates:

```text
SHA-256(lowercase(trim(email_normalized)) + "|" +
        trim(phone_normalized) + "|" +
        trim(submission_reference))
```

For every key component, `undefined` and `null` become an empty string.

| Normalized/context field | Included in key | Key position | Idempotency handling |
|---|---:|---:|---|
| `lead.full_name` | No | — | Passed through in the workflow payload only. |
| `lead.email_normalized` | Yes | 1 | Convert missing/`null` to `""`, trim again, and lowercase. |
| `lead.phone_normalized` | Yes | 2 | Convert missing/`null` to `""` and trim again. |
| `lead.company` | No | — | Passed through in the workflow payload only. |
| `lead.company_website` | No | — | Passed through in the workflow payload only. |
| `lead.service_requested` | No | — | Passed through in the workflow payload only. |
| `lead.message_sanitized` | No | — | Passed through in the workflow payload only. |
| `lead.budget_band` | No | — | Passed through in the workflow payload only. |
| `lead.timeline_band` | No | — | Passed through in the workflow payload only. |
| `lead.country` | No | — | Passed through in the workflow payload only. |
| `lead.consent` | No | — | Passed through in the workflow payload only. |
| `context.submission_reference` | Yes | 3 | Derived from optional raw `submission_reference` using trim and whitespace collapse; then converted from missing/`null` to `""` and trimmed again. This is not a configured Website Lead Form item. |

### Idempotency result flow

| Stage | Mapping/behavior |
|---|---|
| Generate | Store the SHA-256 digest at `idempotency.key`. |
| Claim | Insert `(idempotency_key, correlation_id, status='processing')` into `workflow_audit.idempotency_records`, using an upsert on `idempotency_key`. |
| `claimed` | `should_continue=true`; outcome `continue`. |
| `completed` | `should_continue=false`; outcome `return_previous_result`. |
| `processing` | `should_continue=false`; outcome `accepted_in_progress`. |
| `failed` | `should_continue=false`; outcome `authorized_safe_replay_required`. |
| Guard disabled | `key=null`; `claim_action=bypassed`; `should_continue=true`; outcome `continue`. |

## Source and destination JSON by stage

The examples below show the contents of each n8n item's `json` property. The
outer n8n item wrapper (`{ "json": ..., "pairedItem": ... }`) is omitted.
Runtime-generated UUIDs and timestamps are represented by example values.

### 1. Website Lead Form → Normalize and Validate Lead

The example includes optional raw `submission_reference` to demonstrate the
third idempotency-key component. It is accepted by the normalization code but
is not configured as a visible Website Lead Form item.

Source JSON:

```json
{
  "full_name": "  Jane   Smith  ",
  "email": " JANE@EXAMPLE.TEST ",
  "phone": "+1 (555) 010-2000",
  "company": " Northwind   Services ",
  "company_website": "HTTPS://Example.TEST/services#contact",
  "service_requested": "API integration",
  "message": "  Connect our website leads with HubSpot.  ",
  "budget": "$5,000–$10,000",
  "timeline": "Within one month",
  "country": " United   States ",
  "consent": [
    "I consent to the processing of this demonstration enquiry"
  ],
  "submission_reference": " FORM-001 "
}
```

Destination JSON:

```json
{
  "context": {
    "correlation_id": "d4ba95e6-9d6f-4d57-b836-40b5e125d17d",
    "received_at": "2026-07-28T19:30:00.000Z",
    "submission_reference": "FORM-001",
    "source": "n8n_form",
    "schema": "lead-submission",
    "schema_version": "1.0.0"
  },
  "lead": {
    "phone_normalized": "+15550102000",
    "company": "Northwind Services",
    "company_website": "https://example.test/services",
    "service_requested": "api_integration",
    "budget_band": "5000_10000",
    "timeline_band": "within_one_month",
    "country": "United States",
    "full_name": "Jane Smith",
    "email_normalized": "jane@example.test",
    "message_sanitized": "Connect our website leads with HubSpot.",
    "consent": true
  },
  "validation": {
    "is_valid": true,
    "errors": [],
    "warnings": []
  }
}
```

The raw form fields are replaced by `context`, `lead`, and `validation`; they
are not retained at the top level.

### 2. Read/Apply Idempotency Configuration

This stage has two sources:

- Workflow source JSON: the destination from stage 1.
- Data Table source row:

```json
{
  "key": "idempotency_enabled",
  "enabled": true
}
```

Destination JSON:

```json
{
  "context": {
    "correlation_id": "d4ba95e6-9d6f-4d57-b836-40b5e125d17d",
    "received_at": "2026-07-28T19:30:00.000Z",
    "submission_reference": "FORM-001",
    "source": "n8n_form",
    "schema": "lead-submission",
    "schema_version": "1.0.0"
  },
  "lead": {
    "phone_normalized": "+15550102000",
    "company": "Northwind Services",
    "company_website": "https://example.test/services",
    "service_requested": "api_integration",
    "budget_band": "5000_10000",
    "timeline_band": "within_one_month",
    "country": "United States",
    "full_name": "Jane Smith",
    "email_normalized": "jane@example.test",
    "message_sanitized": "Connect our website leads with HubSpot.",
    "consent": true
  },
  "validation": {
    "is_valid": true,
    "errors": [],
    "warnings": []
  },
  "config": {
    "idempotency_enabled": true,
    "idempotency_config_source": "data_table",
    "idempotency_config_row_found": true
  }
}
```

If the row is absent, `idempotency_config_row_found` is `false` and
`idempotency_enabled` defaults to `true`. Only an explicit Boolean `false`
disables the guard.

### 3. Generate Idempotency Key

Source JSON: the destination from stage 2.

Key source:

```json
{
  "email": "jane@example.test",
  "phone": "+15550102000",
  "submission_reference": "FORM-001",
  "concatenated_source": "jane@example.test|+15550102000|FORM-001"
}
```

Destination JSON:

```json
{
  "context": {
    "correlation_id": "d4ba95e6-9d6f-4d57-b836-40b5e125d17d",
    "received_at": "2026-07-28T19:30:00.000Z",
    "submission_reference": "FORM-001",
    "source": "n8n_form",
    "schema": "lead-submission",
    "schema_version": "1.0.0"
  },
  "lead": {
    "phone_normalized": "+15550102000",
    "company": "Northwind Services",
    "company_website": "https://example.test/services",
    "service_requested": "api_integration",
    "budget_band": "5000_10000",
    "timeline_band": "within_one_month",
    "country": "United States",
    "full_name": "Jane Smith",
    "email_normalized": "jane@example.test",
    "message_sanitized": "Connect our website leads with HubSpot.",
    "consent": true
  },
  "validation": {
    "is_valid": true,
    "errors": [],
    "warnings": []
  },
  "config": {
    "idempotency_enabled": true,
    "idempotency_config_source": "data_table",
    "idempotency_config_row_found": true
  },
  "idempotency": {
    "key": "5c50517d4589f9e8d0c00f123b7b5f38860c8e7ef521dd63ab08fe6ccfd4666e"
  }
}
```

### 4. Claim Idempotency Key

Source JSON: the destination from stage 3. It is supplied to PostgreSQL as
the third query parameter and returned in `workflow_payload`.

Destination JSON returned by PostgreSQL for a newly claimed key:

```json
{
  "claim_action": "claimed",
  "idempotency_key": "5c50517d4589f9e8d0c00f123b7b5f38860c8e7ef521dd63ab08fe6ccfd4666e",
  "stored_correlation_id": "d4ba95e6-9d6f-4d57-b836-40b5e125d17d",
  "stored_status": "processing",
  "previous_result": null,
  "previous_error": null,
  "workflow_payload": {
    "context": {
      "correlation_id": "d4ba95e6-9d6f-4d57-b836-40b5e125d17d",
      "received_at": "2026-07-28T19:30:00.000Z",
      "submission_reference": "FORM-001",
      "source": "n8n_form",
      "schema": "lead-submission",
      "schema_version": "1.0.0"
    },
    "lead": {
      "phone_normalized": "+15550102000",
      "company": "Northwind Services",
      "company_website": "https://example.test/services",
      "service_requested": "api_integration",
      "budget_band": "5000_10000",
      "timeline_band": "within_one_month",
      "country": "United States",
      "full_name": "Jane Smith",
      "email_normalized": "jane@example.test",
      "message_sanitized": "Connect our website leads with HubSpot.",
      "consent": true
    },
    "validation": {
      "is_valid": true,
      "errors": [],
      "warnings": []
    },
    "config": {
      "idempotency_enabled": true,
      "idempotency_config_source": "data_table",
      "idempotency_config_row_found": true
    },
    "idempotency": {
      "key": "5c50517d4589f9e8d0c00f123b7b5f38860c8e7ef521dd63ab08fe6ccfd4666e"
    }
  }
}
```

The PostgreSQL node temporarily replaces the top-level workflow payload with
the claim row. The original payload survives under `workflow_payload`.

### 5. Restore Idempotency Context

Source JSON: the PostgreSQL destination from stage 4.

Destination JSON:

```json
{
  "context": {
    "correlation_id": "d4ba95e6-9d6f-4d57-b836-40b5e125d17d",
    "received_at": "2026-07-28T19:30:00.000Z",
    "submission_reference": "FORM-001",
    "source": "n8n_form",
    "schema": "lead-submission",
    "schema_version": "1.0.0"
  },
  "lead": {
    "phone_normalized": "+15550102000",
    "company": "Northwind Services",
    "company_website": "https://example.test/services",
    "service_requested": "api_integration",
    "budget_band": "5000_10000",
    "timeline_band": "within_one_month",
    "country": "United States",
    "full_name": "Jane Smith",
    "email_normalized": "jane@example.test",
    "message_sanitized": "Connect our website leads with HubSpot.",
    "consent": true
  },
  "validation": {
    "is_valid": true,
    "errors": [],
    "warnings": []
  },
  "config": {
    "idempotency_enabled": true,
    "idempotency_config_source": "data_table",
    "idempotency_config_row_found": true
  },
  "idempotency": {
    "key": "5c50517d4589f9e8d0c00f123b7b5f38860c8e7ef521dd63ab08fe6ccfd4666e",
    "claim_action": "claimed",
    "stored_correlation_id": "d4ba95e6-9d6f-4d57-b836-40b5e125d17d",
    "stored_status": "processing",
    "previous_result": null,
    "previous_error": null
  }
}
```

`workflow_payload` is unwrapped, and the database claim metadata is merged
into `idempotency`.

### 6. Finalize Idempotency Result

Source JSON: the destination from stage 5.

Destination JSON for `claim_action="claimed"`:

```json
{
  "context": {
    "correlation_id": "d4ba95e6-9d6f-4d57-b836-40b5e125d17d",
    "received_at": "2026-07-28T19:30:00.000Z",
    "submission_reference": "FORM-001",
    "source": "n8n_form",
    "schema": "lead-submission",
    "schema_version": "1.0.0"
  },
  "lead": {
    "phone_normalized": "+15550102000",
    "company": "Northwind Services",
    "company_website": "https://example.test/services",
    "service_requested": "api_integration",
    "budget_band": "5000_10000",
    "timeline_band": "within_one_month",
    "country": "United States",
    "full_name": "Jane Smith",
    "email_normalized": "jane@example.test",
    "message_sanitized": "Connect our website leads with HubSpot.",
    "consent": true
  },
  "validation": {
    "is_valid": true,
    "errors": [],
    "warnings": []
  },
  "config": {
    "idempotency_enabled": true,
    "idempotency_config_source": "data_table",
    "idempotency_config_row_found": true
  },
  "idempotency": {
    "key": "5c50517d4589f9e8d0c00f123b7b5f38860c8e7ef521dd63ab08fe6ccfd4666e",
    "claim_action": "claimed",
    "stored_correlation_id": "d4ba95e6-9d6f-4d57-b836-40b5e125d17d",
    "stored_status": "processing",
    "previous_result": null,
    "previous_error": null,
    "enabled": true,
    "should_continue": true,
    "outcome": "continue"
  }
}
```

For an existing key, the same shape is returned with `claim_action` set to
`completed`, `processing`, or `failed`; `should_continue` becomes `false` and
`outcome` is mapped according to the result-flow table above.

### 7. Bypass Idempotency branch

Source JSON: the destination from stage 2 when
`config.idempotency_enabled=false`.

Destination `idempotency` object:

```json
{
  "idempotency": {
    "enabled": false,
    "key": null,
    "claim_action": "bypassed",
    "should_continue": true,
    "outcome": "continue"
  }
}
```

The `context`, `lead`, `validation`, and `config` objects from the source are
retained unchanged alongside this `idempotency` object.

### Pass-through decision stages

`Is Lead Valid?`, `Is Idempotency Enabled?`, and
`Continue After Idempotency?` route items but do not change their JSON.
