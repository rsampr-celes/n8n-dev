# AI request, response, and deterministic decision

The AI qualification child workflow is invoked only when HubSpot contact
matching completed successfully and returned `create` or `update`.

```javascript
continue_to_ai =
  hubspot_search_success === true &&
  ['create', 'update'].includes(crm_action);
```

`review`, failed lookup, and unsupported outcomes do not invoke OpenAI.

## Request sent to OpenAI

Only the following sanitized business fields are sent:

```json
{
  "service_requested": "api_integration",
  "enquiry_message": "Connect our website leads with HubSpot.",
  "budget_band": "5000_10000",
  "timeline_band": "within_one_month",
  "company_description": "B2B service company"
}
```

`Build AI Request` is a contraction boundary. Its node output is the OpenAI
HTTP request body itself: `model`, `messages`, and `response_format`. It does
not add `ai_request` or `openai_request` wrappers, and it does not carry the
normalized lead, CRM match, idempotency data, or other upstream workflow
fields. The original qualification context is retrieved separately only after
the provider responds so deterministic scoring can run.

`Attach AI Provider Response` is another contraction boundary. It emits only:

```json
{
  "content": {
    "service_category": "api_integration",
    "problem_summary": "The company needs website leads synchronized with HubSpot."
  }
}
```

Valid JSON content is parsed into an object for readable n8n output.
Unparseable content remains a string so the validation and correction path can
record the failure.

`Validate AI Response` emits only the validated response and its validation
result:

```json
{
  "ai_response": {},
  "ai_validation": {
    "is_valid": true,
    "errors": []
  }
}
```

After validation, `Calculate Deterministic Score` receives only
`ai_response` and `ai_validation`. It reads the normalized lead explicitly
from `When Executed by Another Workflow`, so no decision-context Merge node is
required. `Prepare AI Review Outcome` uses the same explicit-reference pattern
and emits only a minimal `review_outcome`, so the review branch does not require
a context Merge node either.

Name, email, phone, company name, website, country, consent, CRM match data,
correlation data, and operational metadata are not included in the model
message.

## Response contract

The canonical contract is
`schemas/ai-qualification-response.schema.json`. OpenAI receives that schema as
a strict Structured Outputs `json_schema`, and n8n validates the returned
object again before scoring.

The AI's `estimated_fit_score` and `recommended_action` are retained for audit
but never control the final decision.

## Deterministic score

| Component | Maximum | Implementation |
| --- | ---: | --- |
| Service fit | 30 | 30 for an exact primary-taxonomy match; 20 for another primary category; 10 for `other`; otherwise 0 |
| Problem clarity | 20 | Based on validated message length plus a non-empty AI problem summary |
| Purchase intent | 20 | `strong` 20, `moderate` 10, otherwise 0 |
| Timeline | 15 | Immediate/one month 15, one-to-three months 10, later 5, otherwise 0 |
| Budget information | 10 | 10 for a declared band other than `not_decided` |
| Contact completeness | 5 | One point for each present name, email, phone, and company field |

Low AI confidence below `0.75` always produces `human_review`. Otherwise scores
80–100 produce `sales_qualified`, 50–79 produce `human_review`, and 0–49
produce `nurture`. An invalid AI response is corrected once using its validation
errors. A second invalid response produces `human_review` without a final
numeric score.
