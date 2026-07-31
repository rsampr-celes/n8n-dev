# n8n local development

This repository contains multiple n8n assets developed in one shared local
n8n and PostgreSQL environment.

## Start

```powershell
Set-Location C:\n8n-dev
docker compose -p n8n-local-dev up -d
```

Open <http://localhost:5681> and create the local owner account when prompted.
`N8N_PUBLIC_URL` configures the editor, webhook, and native form URLs that n8n
shows outside the Docker container.

This local stack sets `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` because the bundled
assets reference trusted integration settings such as `CHATWOOT_BASE_URL` and
`CHATWOOT_API_ACCESS_TOKEN` from workflow expressions. Keep public workflow
editing restricted to trusted administrators when using this setting.

## Common commands

```powershell
docker compose -p n8n-local-dev ps
docker compose -p n8n-local-dev logs -f n8n
docker compose -p n8n-local-dev down
```

Do not add `-v` to `docker compose down` during normal use. It deletes the
shared n8n and PostgreSQL volumes.

Asset source files are stored under `assets/`. Local secrets are stored in
`.env` and must never be committed.

## Chatwoot

The Compose stack includes isolated Chatwoot Rails, Sidekiq, PostgreSQL with
pgvector, and Redis services. Chatwoot is available at
<http://localhost:3000>. Its PostgreSQL, Redis, and uploaded-file data use
separate named volumes from n8n.

Initialize a fresh Chatwoot database once before starting the application:

```powershell
docker compose up -d chatwoot-postgres chatwoot-redis
docker compose run --rm chatwoot-rails bundle exec rails db:chatwoot_prepare
docker compose up -d chatwoot-rails chatwoot-sidekiq
```

Create the initial Chatwoot account while `CHATWOOT_ENABLE_ACCOUNT_SIGNUP=true`.
Set it to `false` and recreate the Chatwoot services after onboarding. Generate
an access token from the Chatwoot user profile, store it as
`CHATWOOT_API_ACCESS_TOKEN` in `.env.chatwoot-n8n`, and recreate n8n so
ASSET002 can use it. Runtime secrets are ignored by Git; the corresponding
`.example` files document their required fields.

The local Compose stack enables Chatwoot's `SAFE_FETCH_ALLOW_PRIVATE_NETWORK`
setting so account webhooks can reach n8n through `host.docker.internal`.
Keep this disabled in internet-facing deployments; use a public HTTPS webhook
URL there instead.

## Assets

- `ASSET001-ai-lead-qualification` — native website lead form and the planned
  AI qualification, HubSpot routing, Slack notification, and audit workflow.
