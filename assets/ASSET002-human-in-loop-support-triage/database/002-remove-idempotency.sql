DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'asset002_audit'
      AND table_name = 'message_processing'
      AND column_name = 'idempotency_key'
  ) THEN
    ALTER TABLE asset002_audit.message_processing
      DROP CONSTRAINT IF EXISTS message_processing_pkey;
    ALTER TABLE asset002_audit.message_processing
      DROP COLUMN idempotency_key;
    ALTER TABLE asset002_audit.message_processing
      ADD CONSTRAINT message_processing_pkey PRIMARY KEY (correlation_id);
  END IF;
END $$;
