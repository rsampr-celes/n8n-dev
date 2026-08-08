CREATE SCHEMA IF NOT EXISTS asset002_audit;

CREATE TABLE IF NOT EXISTS asset002_audit.message_processing (
  correlation_id uuid PRIMARY KEY,
  account_id bigint NOT NULL,
  conversation_id bigint NOT NULL,
  message_id bigint NOT NULL,
  event_kind text NOT NULL,
  status text NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  triage_json jsonb,
  response_preparation_json jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON SCHEMA asset002_audit FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA asset002_audit FROM PUBLIC;
