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

## Assets

- `ASSET001-ai-lead-qualification` — native website lead form and the planned
  AI qualification, HubSpot routing, Slack notification, and audit workflow.
