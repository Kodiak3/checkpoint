# Finance Checkpoint

A private-first personal finance dashboard for tracking an available balance, recurring commitments, reserved money, safe-to-spend funds and transaction history.

## Features

- Date-aware commitments with overdue and upcoming indicators
- Editable amounts, billing dates, frequencies and reserve status
- Manual income and spending entries with categories and dates
- Bank CSV preview, duplicate detection and import
- Balance reconciliation with an activity trail
- Cloudflare D1 persistence
- WebMCP and remote MCP tool definitions
- Responsive dark interface

## Privacy

This repository contains application code and database migrations only. It does **not** contain the deployed Site's database, financial records, names, balances, transactions or personal correction notes.

A fresh deployment starts with an empty balance and no commitments.

## Development

```bash
pnpm install
pnpm db:generate
pnpm dev
```

The application expects a Cloudflare D1 binding named `DB`.

## Demo

The owner-private deployment is hosted with ChatGPT Sites. Access requires permission from its owner.
