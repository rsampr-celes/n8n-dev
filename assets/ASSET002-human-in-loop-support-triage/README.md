# ASSET002 — Human-in-the-Loop Support Triage

This asset implements the ASSET002.001 specification as one main workflow and three subflows:

- `ASSET002 - Human-in-the-Loop Support Triage` — Chatwoot webhook intake, child orchestration, routing, private review-note creation, and audit completion.
- `ASSET002 - Prepare Message` — normalization, validation, event classification, and the idempotency claim.
- `ASSET002 - AI Triage` — strict AI classification plus deterministic routing and safe fallbacks.
- `ASSET002 - Response Preparation` — approved-knowledge retrieval, grounded draft generation, source validation, and manual-handling fallback.

The workflows never publish an AI response to a customer. The only Chatwoot write is a private internal note containing the triage evidence and optional draft. An authorised agent must review and send the final public response in Chatwoot.

## Required setup

1. Run `database/001-create-audit-tables.sql` against the database selected by the PostgreSQL credential used on the workflow audit nodes. In the local environment this is the `lead_audit` database, not n8n's internal `n8n` metadata database.
2. Select the local shared PostgreSQL credential named `ASSET001 Audit PostgreSQL` on the audit nodes, or remap them to an equivalent PostgreSQL credential in another environment.
3. Select the environment's n8n OpenAI credential named `OpenAI account` in both AI request nodes.
4. Set trusted n8n environment variables `CHATWOOT_BASE_URL` and `CHATWOOT_API_ACCESS_TOKEN`.
5. Create an n8n Data Table named `asset002_approved_knowledge` with the fields below.
6. Import and publish all three child workflows before importing and activating the main workflow: Prepare Message, AI Triage, then Response Preparation.
7. Configure the Chatwoot webhook to POST `message_created` events to `/webhook/asset002-chatwoot-events`.

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

## Safety and routing

- Webhook fields are normalized and allowlisted before validation.
- An audit-database claim based on account, conversation, message, and event kind occurs before either AI call.
- Invalid AI output, confidence below `0.75`, sensitive subjects, critical urgency, distress, refunds, and cancellations route to priority review and skip response drafting.
- Response source IDs are checked against the passages actually retrieved.
- A response confidence below `0.75` or an unsupported source forces manual handling.
- Incoming messages and public agent messages are separate event paths. Public agent messages are recorded as delivery evidence but never enter AI processing.
- Provider and knowledge-read failures collapse to manual handling. A failed private-note write marks the audit row `failed` with a sanitized error code.

The main flow retrieves Chatwoot conversation messages only after a successful idempotency claim. The adapter excludes private notes and the current message, keeps at most the ten most recent public messages, and passes only role and bounded content to the child workflows.

## Build and test

```powershell
npm run build:asset002
npm run test:asset002
```

Source files under `src/` are authoritative. `scripts/build-workflows.mjs` embeds them into deterministic workflow JSON exports under `workflows/`.

## Postman

Import `postman/ASSET002-support-triage.postman_collection.json` after activating the Main Flow. Requests 01–06 send synthetic events directly to n8n. Request 01 generates unique conversation and message IDs; request 02 deliberately reuses the first ID to exercise duplicate prevention. The remaining direct requests cover sensitive escalation, invalid input, agent-delivery auditing, and private-note loop prevention.

For a real Chatwoot-triggered test, set `chatwootWebsiteToken` in the collection variables, then run the `07 - Chatwoot End-to-End` folder in order. The Website token is available from the inbox's **Script** tab. The folder initializes an authentic widget session, captures its short-lived `X-Auth-Token`, creates the Website conversation with an initial message, and sends another incoming message through Chatwoot's widget API. Chatwoot then emits `message_created` to the configured ASSET002 webhook. The exported collection intentionally leaves the Website and widget-session tokens blank.
