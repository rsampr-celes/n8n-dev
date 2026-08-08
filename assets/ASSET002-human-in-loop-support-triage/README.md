# ASSET002 — Human-in-the-Loop Support Triage

This asset implements the ASSET002.001 specification as one main workflow and three subflows:

- `ASSET002 - Human-in-the-Loop Support Triage` — Chatwoot automation intake, child orchestration, routing, and private review-note creation.
- `ASSET002 - Prepare Message` — normalization, validation, and event classification.
- `ASSET002 - AI Triage` — strict AI classification plus deterministic routing and safe fallbacks.
- `ASSET002 - Response Preparation` — approved-knowledge retrieval, grounded draft generation, source validation, and manual-handling fallback.

The workflows never publish an AI response to a customer. The only Chatwoot write is a private internal note containing the triage evidence and optional draft. An authorised agent must review and send the final public response in Chatwoot.

## Required setup

1. Existing installations should run `database/004-remove-processing-audit.sql` against the former audit database to remove the obsolete ASSET002 processing table. New installations do not require PostgreSQL for ASSET002.
2. Select the environment's n8n OpenAI credential named `OpenAI account` in both AI request nodes.
3. Set trusted n8n environment variables `CHATWOOT_BASE_URL`, `CHATWOOT_API_ACCESS_TOKEN`, and a random `CHATWOOT_AUTOMATION_WEBHOOK_TOKEN` of at least 32 characters.
4. Create an n8n Data Table named `asset002_approved_knowledge` with the fields below.
5. Import and publish all three child workflows before importing and activating the main workflow: Prepare Message, AI Triage, then Response Preparation.
6. In Chatwoot, create an active automation with event **Message Created**, condition **Message Type equals Incoming**, and action **Send Webhook Event**. Set its URL to `/webhook/asset002-chatwoot-events?token=<CHATWOOT_AUTOMATION_WEBHOOK_TOKEN>`. Remove any standard account webhook targeting this endpoint to prevent duplicate processing.

### Approved knowledge table

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `knowledge_id` | String | Yes | Stable unique source identifier |
| `title` | String | Yes | Agent-facing source title |
| `category` | String | Yes | Triage category or `general` |
| `content` | String | Yes | Approved support guidance |
| `keywords` | String | No | Space-separated search terms |
| `approved` | Boolean | Yes | Only Boolean `true` is eligible |
| `source_url` | String | No | Internal reference for the agent |

The demonstration lookup reads this intentionally small table and ranks approved rows locally. It returns at most three passages. If none match, Response Preparation returns `manual_handling` and does not invoke AI.

See [Approved knowledge Data Table](docs/approved-knowledge-data-table.md) for example data, UI maintenance, controlled SQL insertion, and verification.

## Safety and routing

- Automation webhook requests are rejected before processing unless their query token matches the trusted n8n environment value.
- Chatwoot automation payload fields are normalized and allowlisted before validation.
- Every accepted incoming webhook receives a fresh correlation ID for the private review note. Replayed events are processed again.
- Invalid AI output, confidence below `0.75`, sensitive subjects, critical urgency, distress, refunds, and cancellations route to priority review. Priority routing does not prevent approved-knowledge lookup or draft preparation.
- Response source IDs are checked against the passages actually retrieved.
- A response confidence below `0.75` or an unsupported source forces manual handling.
- Only incoming customer messages enter processing. Public agent messages, private notes, and unsupported Chatwoot events are ignored.
- AI provider request failures stop the workflow and mark the HTTP node red. Knowledge-read failures collapse to manual handling. A failed private-note write fails the n8n execution.

The main flow retrieves Chatwoot conversation messages immediately after validation. The adapter excludes private notes and the current message, keeps at most the ten most recent public messages, and passes only role and bounded content to the child workflows.

## Build and test

```powershell
npm run build:asset002
npm run test:asset002
```

Source files under `src/` are authoritative. `scripts/build-workflows.mjs` embeds them into deterministic workflow JSON exports under `workflows/`.

## Postman

Import `postman/ASSET002-support-triage.postman_collection.json` after activating the Main Flow. Requests 01–06 send synthetic events directly to n8n. Request 01 generates unique conversation and message IDs; request 02 deliberately reuses the first ID and is expected to process again. The remaining direct requests cover sensitive escalation, invalid input, public-agent-message filtering, and private-note loop prevention.

For direct webhook tests, set `automationWebhookToken` to the trusted n8n environment value. For a real Chatwoot-triggered test, set `chatwootWebsiteToken`, then run the `07 - Chatwoot End-to-End` folder in order. The Website token is available from the inbox's **Script** tab. The folder initializes an authentic widget session, captures its short-lived `X-Auth-Token`, creates the Website conversation with an initial message, and sends another incoming message through Chatwoot's widget API. The Chatwoot automation then emits `automation_event.message_created` to ASSET002. The exported collection intentionally leaves all tokens blank.
