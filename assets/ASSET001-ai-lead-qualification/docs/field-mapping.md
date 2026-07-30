# ASSET001 field mapping

This mapping reflects the current implementation in:

- `workflows/ASSET001-website-lead-form.json`
- `workflows/ASSET001-idempotency-guard.json`
- `src/normalize-lead.js`
- `src/validate-lead.js`
- `src/generate-idempotency-key.js`
- `schemas/lead-submission.schema.json`

Each processing stage emits an explicit contract. A stage does not carry the
complete preceding payload unless every field is required by the next stage.

## FormItem → Normalize Lead → Validate Lead

| FormItem | Form label | Type | Required | Normalized output | Normalize rule | Blank handling | Schema validation |
|---|---|---|---:|---|---|---|---|
| `first_name` | First name | text | Yes | `lead.first_name` | Trim and collapse whitespace runs. | Omit. | Required string; length 1–120. |
| `last_name` | Last name | text | Yes | `lead.last_name` | Trim and collapse whitespace runs. | Omit. | Required string; length 1–120. |
| `email` | Work email | email | Yes | `lead.email_normalized` | Trim and lowercase. | Omit. | Required email string; maximum 254 characters. |
| `phone` | Phone number | text | No | `lead.phone_normalized` | Trim; remove whitespace, parentheses, periods, and hyphens. | `null` | String or `null`; must match `^\+[1-9]\d{6,14}$`. |
| `company` | Company | text | No | `lead.company` | Trim and collapse whitespace runs. | `null` | String or `null`; maximum 160 characters. |
| `company_description` | Company description | textarea | No | `lead.company_description` | Trim and collapse whitespace runs. | `null` | String or `null`; maximum 500 characters. |
| `company_website` | Company website | text | No | `lead.company_website` | Trim, remove the fragment, lowercase the HTTP(S) scheme and authority, and add `/` when the path is empty. Invalid input remains trimmed for validation to reject. | `null` | HTTP(S) URL string or `null`; valid hostname and optional port; maximum 2,048 characters. |
| `service_requested` | Service requested | dropdown | No | `lead.service_requested` | Normalize whitespace and map to the canonical value below. | `null` | Canonical enum string or `null`. |
| `message` | Tell us about your requirement | textarea | Yes | `lead.message_sanitized` | Normalize line endings, remove disallowed control characters, and trim. | Omit. | Required string; length 1–5,000. |
| `budget` | Estimated budget | dropdown | No | `lead.budget_band` | Normalize whitespace and map to the canonical value below. | `null` | Canonical enum string or `null`. |
| `timeline` | Expected timeline | dropdown | No | `lead.timeline_band` | Normalize whitespace and map to the canonical value below. | `null` | Canonical enum string or `null`. |
| `country` | Country | text | No | `lead.country` | Trim and collapse whitespace runs. | `null` | String or `null`; maximum 100 characters. |
| `consent` | Consent | checkbox | Yes | `lead.consent` | Produce `true` only for Boolean `true`, the exact consent text, or a one-element array containing the exact text. | Omit for `undefined`/`null`. | Required; must be Boolean `true`. |

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

## Normalized fields → Idempotency sub-workflow

The complete `{ lead }` normalization result is sent to the sub-workflow. Its
first Code stage extracts only the following fields:

| Normalized field | Retained after configuration | Stage field | Handling |
|---|---:|---|---|
| `lead.email_normalized` | Yes | `email_normalized` | Key component 1; trim and lowercase again. |
| `lead.phone_normalized` | Yes | `phone_normalized` | Key component 2; `null` becomes an empty string. |
| — | Generated | `correlation_id` | Created inside the idempotency sub-workflow. |
| All other `lead` fields | No | — | Removed at the idempotency boundary. |

The key is:

```text
SHA-256(lowercase(trim(email_normalized)) + "|" +
        trim(phone_normalized))
```

## Source and destination JSON by stage

Examples show the contents of each n8n item's `json` property. The outer n8n
item wrapper is omitted.

### 1. Website Lead Form → Normalize Lead

Source:

```json
{
  "first_name": "  Jane  ",
  "last_name": "  Smith  ",
  "email": " JANE@EXAMPLE.TEST ",
  "phone": "+1 (555) 010-2000",
  "company": " Northwind   Services ",
  "company_description": " B2B service company ",
  "company_website": "HTTPS://Example.TEST/services#contact",
  "service_requested": "API integration",
  "message": "  Connect our website leads with HubSpot.  ",
  "budget": "$5,000–$10,000",
  "timeline": "Within one month",
  "country": " United   States ",
  "consent": [
    "I consent to the processing of this demonstration enquiry"
  ]
}
```

Destination:

```json
{
  "lead": {
    "phone_normalized": "+15550102000",
    "company": "Northwind Services",
    "company_description": "B2B service company",
    "company_website": "https://example.test/services",
    "service_requested": "api_integration",
    "budget_band": "5000_10000",
    "timeline_band": "within_one_month",
    "country": "United States",
    "first_name": "Jane",
    "last_name": "Smith",
    "email_normalized": "jane@example.test",
    "message_sanitized": "Connect our website leads with HubSpot.",
    "consent": true
  }
}
```

For valid items, **Validate Lead** preserves `{ lead }` and adds `{ validation }`
for **Is Lead Valid?**. Invalid output contains only `{ validation }`, keeping
submitted lead data out of the failure boundary. The valid branch starts
**Execute Idempotency Guard** directly.
When the guard authorizes continuation, it returns the original `lead` with its
`idempotency` decision but omits `validation`. **Continue After Idempotency?**
then sends that item to HubSpot matching.

### 2. Execute Idempotency Guard → Apply Idempotency Configuration

Sources:

```json
{
  "workflow_request": {
    "lead": {
      "phone_normalized": "+15550102000",
      "company": "Northwind Services",
      "company_description": "B2B service company",
      "company_website": "https://example.test/services",
      "service_requested": "api_integration",
      "budget_band": "5000_10000",
      "timeline_band": "within_one_month",
      "country": "United States",
      "first_name": "Jane",
      "last_name": "Smith",
      "email_normalized": "jane@example.test",
      "message_sanitized": "Connect our website leads with HubSpot.",
      "consent": true
    }
  },
  "data_table_row": {
    "key": "idempotency_enabled",
    "enabled": true
  }
}
```

Destination:

```json
{
  "correlation_id": "d4ba95e6-9d6f-4d57-b836-40b5e125d17d",
  "email_normalized": "jane@example.test",
  "phone_normalized": "+15550102000",
  "idempotency_enabled": true
}
```

Only an explicit Boolean `false` disables the guard. A missing configuration
row fails safe with `idempotency_enabled=true`. This destination is the
contraction boundary; unneeded normalized fields are discarded here.

### 3. Generate Idempotency Key

Source: the stage 2 destination.

Destination:

```json
{
  "correlation_id": "d4ba95e6-9d6f-4d57-b836-40b5e125d17d",
  "idempotency_key": "ff2aa5825134022d89acdb8c1db98d8391e4ae8e156f5dcbe2afa146784d4763"
}
```

The two key components and configuration flag are discarded after the hash
is generated.

### 4. Claim Idempotency Key

Source: the stage 3 destination. Its two fields become the two PostgreSQL
parameters.

Destination for a newly claimed key:

```json
{
  "claim_action": "claimed",
  "idempotency_key": "ff2aa5825134022d89acdb8c1db98d8391e4ae8e156f5dcbe2afa146784d4763",
  "stored_correlation_id": "d4ba95e6-9d6f-4d57-b836-40b5e125d17d",
  "stored_status": "processing",
  "previous_result": null,
  "previous_error": null
}
```

The database no longer receives or returns a `workflow_payload`. Therefore,
there is no Restore Idempotency Context stage.

### 5. Route and Finalize Idempotency Result

Source: the stage 4 destination.

`Route Claim Action` exposes four labeled execution paths in the n8n canvas:
`claimed`, `completed`, `processing`, and `failed`. All four paths converge on
`Finalize Idempotency Result`, which emits the idempotency response contract
below. A `claimed` result also includes the original top-level `lead`, allowing
the parent flow to continue without a merge node. Non-continuing results omit
`lead`. The selected route is visible in each execution.

Destination:

```json
{
  "idempotency": {
    "enabled": true,
    "key": "ff2aa5825134022d89acdb8c1db98d8391e4ae8e156f5dcbe2afa146784d4763",
    "claim_action": "claimed",
    "stored_correlation_id": "d4ba95e6-9d6f-4d57-b836-40b5e125d17d",
    "stored_status": "processing",
    "previous_result": null,
    "previous_error": null,
    "should_continue": true,
    "outcome": "continue"
  }
}
```

| Claim action | `should_continue` | Outcome |
|---|---:|---|
| `claimed` | `true` | `continue` |
| `completed` | `false` | `return_previous_result` |
| `processing` | `false` | `accepted_in_progress` |
| `failed` | `false` | `authorized_safe_replay_required` |

### 6. Bypass branch

Source: the stage 2 destination when `idempotency_enabled=false`.

The bypass result includes the original top-level `lead` alongside the
idempotency response so the parent can continue directly.

Destination:

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

### Pass-through decision stages

`Is Lead Valid?`, `Is Idempotency Enabled?`, `Continue After Idempotency?`,
and `Invoke AI?` route items but do not change their JSON.

After idempotency, the parent sends the normalized lead to HubSpot matching.
The HubSpot child returns:

```json
{
  "hubspot_search_success": true,
  "crm_action": "create",
  "crm_match": {
    "decision": "create",
    "status": "not_found",
    "matched_by": null,
    "contact_id": null,
    "match_count": 0,
    "candidate_contact_ids": [],
    "review_reason": null
  }
}
```

`Determine AI Invocation` emits only `continue_to_ai` and `ai_skip_reason`, with
`continue_to_ai=true` only for successful `create` and `update` outcomes. On
the true branch, **Execute AI Qualification** maps `lead` from **Continue After
Idempotency?** and maps the CRM fields from **Execute HubSpot Contact Match**
directly into the AI child's typed workflow inputs. The AI child then sends only
`service_requested`, `enquiry_message`, `budget_band`, `timeline_band`, and
`company_description` to OpenAI. See `docs/ai-request-response.md` for the
response contract and deterministic score mapping.

After AI qualification, **Execute HubSpot Contact Deal** maps the normalized
lead, contact-match decision, complete AI child result, correlation ID,
submission reference, write timestamp, source, pipeline ID, and initial stage
directly into typed child inputs. The child creates minimal contact and deal
request objects and does not receive an accumulated parent payload.

The CRM child searches deals by `workflow_correlation_id` before any write. It
then creates or updates the contact, creates or updates the single matched deal,
and applies the default contact/deal association. Its success response contains
only the correlation ID plus contact and deal actions and IDs. See
`docs/hubspot-crm-request-response.md`.
