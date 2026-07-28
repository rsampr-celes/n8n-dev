BEGIN;

CREATE SCHEMA workflow_audit;

CREATE TABLE workflow_audit.idempotency_records (
    idempotency_key varchar(64) PRIMARY KEY,
    correlation_id uuid NOT NULL,
    status varchar(20) NOT NULL DEFAULT 'processing',
    result_json jsonb,
    error_json jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,

    CONSTRAINT ck_idempotency_key_sha256
        CHECK (idempotency_key ~ '^[0-9a-f]{64}$'),

    CONSTRAINT ck_idempotency_status
        CHECK (status IN ('processing', 'completed', 'failed')),

    CONSTRAINT ck_idempotency_completed
        CHECK (
            status <> 'completed'
            OR (completed_at IS NOT NULL AND result_json IS NOT NULL)
        )
);

COMMENT ON TABLE workflow_audit.idempotency_records IS
    'Claims idempotency keys and stores stable results for duplicate workflow requests.';

COMMENT ON COLUMN workflow_audit.idempotency_records.idempotency_key IS
    'Lowercase hexadecimal SHA-256 digest of the canonical idempotency source.';

COMMENT ON COLUMN workflow_audit.idempotency_records.result_json IS
    'Stable response returned when an idempotency key has already completed.';

COMMENT ON COLUMN workflow_audit.idempotency_records.error_json IS
    'Sanitized failure details; must not contain credentials or unnecessary personal data.';

COMMIT;
