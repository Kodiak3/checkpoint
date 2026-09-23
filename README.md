# Finance Checkpoint

Finance Checkpoint is a private-first personal finance dashboard for maintaining a reliable snapshot of what is actually available, what must still be paid, and what is genuinely safe to spend.

It is designed as a working ledger rather than a banking application. It cannot access a bank account, move money, make payments or discover transactions by itself. Every change comes from an explicit entry, reconciliation, bill update, CSV import or authorised MCP tool call.

## Contents

- [Core concepts](#core-concepts)
- [Feature guide](#feature-guide)
- [Date behaviour](#date-behaviour)
- [Database and privacy](#database-and-privacy)
- [MCP integration](#mcp-integration)
- [Local development](#local-development)
- [Database migrations](#database-migrations)
- [Deployment](#deployment)
- [Project structure](#project-structure)
- [Safety boundaries](#safety-boundaries)

## Core concepts

### Available balance

The available balance is the confirmed bank position stored by the tracker. Manual spending reduces it, manual income increases it, and reconciliation replaces it with a newly confirmed figure.

### Reserved money

A commitment can be marked as reserved. Reserved commitments do not alter the available balance; they are subtracted only when calculating safe to spend.

```text
safe to spend = available balance - active reserved commitments
```

### Posted commitments

Marking a commitment as posted is an explicit accounting action. It deducts that commitment from the available balance, changes its status to posted, clears its reserve and writes an activity entry.

Reversing a posted commitment performs the opposite movement and records that reversal.

Dates never post commitments automatically.

### Reconciliation

Reconciliation aligns the tracker with a confirmed bank balance. The difference between the previous and confirmed balances is recorded as a reconciliation activity entry, preserving an audit trail instead of silently rewriting history.

## Feature guide

### Overview

The Overview tab provides the immediate financial position:

- **Available balance** — the confirmed balance held by the tracker.
- **Reserved** — the sum of active commitments still ring-fenced.
- **Safe to spend** — the remaining amount after reserves.
- **Spendable capacity** — safe to spend represented as a percentage of the available balance.
- **Still due** — reserved commitments awaiting explicit posting.
- **System readout** — recurring baseline, active planned total, next payday and recorded activity count.

The status strip displays the current date, next payday and balance anchor date.

### Quick update

Quick Update records an individual movement.

Supported fields:

- Spending or income
- Amount
- Description
- Transaction date
- Category

Available spending categories include everyday spending, subscriptions and bills, transport, health, transfers and other. Income entries are categorised as income automatically.

Each entry updates the balance and appears in the activity log.

### Balance reconciliation

The **Reconcile balance** control accepts the available balance confirmed in a banking app.

The tracker then:

1. Calculates the difference from its previous balance.
2. Stores the newly confirmed balance.
3. Updates the anchor date.
4. Creates a reconciliation entry when the difference is non-zero.

Reconciliation does not connect to or modify the real bank account.

### Commitment editor

Commitments represent recurring bills, subscriptions, repayments or planned one-off payments.

Each commitment supports:

- Name
- Current amount
- Normal amount
- Due date
- Frequency
- Planning note
- Reserve status
- Active status

Supported frequencies are weekly, monthly, quarterly, yearly and one-off.

The current amount can differ from the normal amount, allowing temporary increases or unusual billing periods to be shown without losing the normal baseline.

Editing a commitment does not change the available balance. Only explicitly posting or reversing it changes the balance.

Inactive commitments remain in the database but are excluded from active planning totals and safe-to-spend reserves.

### Commitment status

The commitment list shows:

- Posted or due state
- Exact due date
- Relative due status
- Frequency
- Planning note
- Current amount
- Normal amount when different

A commitment without a known billing date displays **Date not set** instead of inventing one.

### Activity log

The activity log records:

- Manual transactions
- Bill postings and reversals
- Balance reconciliations
- Imported bank transactions
- MCP-created transactions

Each row includes its description, date, category, source and signed amount.

### CSV import

The importer expects a CSV containing these columns:

```text
Date,Amount,Memo
```

Dates use `DD/MM/YYYY`. Positive amounts are treated as income and negative amounts as spending.

Before committing an import, Checkpoint shows:

- Valid row count
- New transaction count
- Duplicate count
- New income
- New spending
- Net movement

Duplicate detection uses a deterministic hash of the date, amount and normalised description. Re-importing the same records will not duplicate them.

CSV imports add transaction history but deliberately do not change the confirmed available balance. Reconcile after importing if the tracker must be aligned to a bank statement.

### Protected corrections

The Corrections tab can display durable contextual notes stored in the database. These are intended for facts that must survive later recalculations.

The public source contains no personal correction notes or example financial records.

### Private access

The hosted Site is designed for owner-controlled access. Application privacy and repository visibility are separate concerns: this public repository contains code, while the deployed database and Site access policy remain private.

## Date behaviour

Checkpoint is date-aware:

- The browser supplies the user's local current date for interface labels.
- The MCP server supplies the current UTC calendar date in structured responses.
- Due dates are stored as ISO dates in `YYYY-MM-DD` format.
- The interface identifies overdue, due today, due tomorrow and future commitments.
- Next payday is editable from the Dates dialog.
- Transaction dates are independently editable.

Dates are informational. Time passing never deducts money, posts a bill or changes a balance automatically.

## Database and privacy

Finance Checkpoint uses Cloudflare D1 through a logical binding named `DB`.

The repository includes:

- The database schema
- Additive migration files
- Queries and update logic
- Empty-database initialisation

The repository does **not** include:

- The deployed database file
- Personal names
- Real balances
- Transactions
- Merchant records
- Billing dates
- Commitments
- Correction notes
- Authentication secrets or API keys

A fresh database starts with a zero balance, no commitments, no transactions and no corrections.

The deployed Site's database exists separately from the Git repository. Publishing source changes does not replace or expose its stored rows.

## MCP integration

Checkpoint exposes both page-bound WebMCP tools and a remote Streamable HTTP MCP endpoint at `/mcp`.

### Remote tools

#### `read_finance_checkpoint`

Returns:

- Current date
- Available balance
- Reserved total
- Safe-to-spend total
- Anchor date
- Next payday
- Reserved commitments still due

Read-only.

#### `list_finance_commitments`

Returns commitment names, amounts, dates, frequencies, notes, posting state, reserve state and active state.

Read-only.

#### `list_finance_transactions`

Returns a bounded list of recent tracker transactions.

Read-only.

#### `record_finance_transaction`

Records confirmed income or spending and updates the tracker balance.

Write operation. It cannot move real money.

#### `update_finance_commitment`

Adds a commitment or edits its planning fields.

Write operation. It does not post the commitment or alter the available balance.

### Page-bound tools

When opened in a compatible browser, the page registers tools for:

- Reading the current checkpoint
- Recording a transaction
- Reconciling the balance

The hosted MCP connection depends on MCP being enabled for the Site owner or workspace. No OpenAI API key is embedded in this project.

## Local development

### Requirements

- Node.js 22.13 or newer
- pnpm 11
- A local Cloudflare D1-compatible development environment

### Install

```bash
pnpm install
```

### Generate migrations after schema changes

```bash
pnpm db:generate
```

### Start development mode

```bash
pnpm dev
```

### Validate

```bash
pnpm lint
pnpm build
```

The application expects a D1 binding called `DB`. The Sites/Vite configuration supplies the local binding used by the managed development environment.

## Database migrations

The Drizzle schema lives in `db/schema.ts`. Generated migrations are stored in `drizzle/`.

Existing migrations should be treated as immutable. After changing the schema:

1. Update `db/schema.ts`.
2. Run `pnpm db:generate`.
3. Inspect the generated SQL.
4. Confirm that existing data is preserved.
5. Build before deployment.

The included migrations create the ledger tables and add structured date, frequency, activity and payday fields.

## Deployment

The project is built for ChatGPT Sites and Cloudflare-compatible Worker output.

The public repository intentionally omits a bound Site project ID. A deployment must provide its own Site registration and D1 resource.

The logical hosting configuration is:

```json
{
  "d1": "DB",
  "r2": null,
  "capabilities": ["mcp"]
}
```

No `OPENAI_API_KEY` is required for the dashboard itself.

## Project structure

```text
app/
  api/finance/route.ts   Finance HTTP API
  mcp/route.ts           Remote MCP endpoint
  page.tsx               Dashboard interface and WebMCP tools
  globals.css            Visual system and responsive layout
db/
  index.ts               D1 connection
  schema.ts              Drizzle schema
drizzle/                 Generated SQL migrations
lib/
  finance.ts             Ledger operations and business rules
components/ui/           Reused interface primitives
build/                   Sites/Vite integration
scripts/                 Build and environment helpers
public/favicon.svg       Project icon
```

## Safety boundaries

Finance Checkpoint:

- Cannot initiate payments
- Cannot access a bank without a separate integration
- Does not automatically post bills based on dates
- Does not silently overwrite imported history
- Does not embed an OpenAI API key
- Does not include production database contents in source control
- Requires an explicit write action before changing tracker data

It is a planning and reconciliation tool, not financial advice or a substitute for checking the underlying bank account.
