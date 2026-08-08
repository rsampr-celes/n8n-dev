# ASSET002 approved knowledge Data Table

ASSET002 uses the n8n Data Table `asset002_approved_knowledge` as the approved source for suggested customer responses. The workflow reads this table, keeps only approved rows, ranks them against the triage category and customer-message terms, and supplies at most three matching passages to the response AI.

## Find the table

In n8n, open the personal project and select **Data Tables** > **asset002_approved_knowledge**.

The table has these columns:

| Column | Type | Purpose |
| --- | --- | --- |
| `knowledge_id` | String | Stable unique identifier used in AI citations |
| `title` | String | Source title shown to the agent |
| `category` | String | Triage category, or `general` |
| `content` | String | Approved support guidance |
| `keywords` | String | Space-separated lookup terms |
| `source_url` | String | Optional agent reference |
| `approved` | Boolean | Only rows set to `true` are eligible |

Use **Add row** in the n8n UI for normal maintenance. Use only guidance that has been reviewed and approved by the organization.

## Example row

| Column | Example value |
| --- | --- |
| `knowledge_id` | `KB-BILLING-001` |
| `title` | `Download an invoice` |
| `category` | `billing_payments` |
| `content` | `Customers can download available invoices by signing in, opening Billing, selecting Invoices, and choosing Download next to the required invoice.` |
| `keywords` | `invoice billing download receipt statement` |
| `source_url` | `https://example.com/kb/download-invoice` |
| `approved` | `true` |

Replace demonstration content and URLs with the organization's real approved procedures before production use.

## Controlled SQL insertion

Direct SQL is useful for controlled local setup or bulk loading, but it bypasses the n8n UI. The physical row-table name contains the Data Table ID and changes if the Data Table is recreated.

Find the current ID:

```powershell
@'
SELECT id, name
FROM data_table
WHERE name = 'asset002_approved_knowledge';
'@ | docker compose -p n8n-local-dev exec -T postgres psql -U n8n -d n8n
```

For an ID such as `bRNP2R0LR9Vmhtso`, the physical table is `data_table_user_bRNP2R0LR9Vmhtso`. Keep the mixed-case name quoted when using PostgreSQL.

Insert a row without duplicating its `knowledge_id`:

```powershell
@'
BEGIN;

INSERT INTO "data_table_user_bRNP2R0LR9Vmhtso"
  (knowledge_id, title, category, content, keywords, source_url, approved)
SELECT
  'KB-BILLING-001',
  'Download an invoice',
  'billing_payments',
  'Customers can download available invoices by signing in, opening Billing, selecting Invoices, and choosing Download next to the required invoice.',
  'invoice billing download receipt statement',
  'https://example.com/kb/download-invoice',
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM "data_table_user_bRNP2R0LR9Vmhtso"
  WHERE knowledge_id = 'KB-BILLING-001'
);

COMMIT;
'@ | docker compose -p n8n-local-dev exec -T postgres psql -v ON_ERROR_STOP=1 -U n8n -d n8n
```

The internal `id`, `createdAt`, and `updatedAt` values use database defaults.

## Verify the data

From the n8n UI, reopen the Data Table and confirm the rows. To verify through PostgreSQL:

```powershell
@'
SELECT knowledge_id, title, category, approved
FROM "data_table_user_bRNP2R0LR9Vmhtso"
ORDER BY knowledge_id;
'@ | docker compose -p n8n-local-dev exec -T postgres psql -U n8n -d n8n
```

If Response Preparation returns `approved_knowledge_not_found`, check that the table contains a relevant row, `approved` is Boolean `true`, and the category or keywords match the request.
