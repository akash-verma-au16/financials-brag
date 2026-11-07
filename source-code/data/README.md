# data/

Created and filled by the app on your machine. **Everything in here is personal and git-ignored**
(the original author's files were not shipped). This README is the only file kept.

| Path | What it is | Written by |
| --- | --- | --- |
| `data/history.csv` | Net-worth history: one row per account per balance date — `date,recordedAt,accountKey,bucket,balance`. Appended after each real data load. | `src/data/appDataSync.ts` via `tools/api.ts` |
| `data/private/market/` | Cache of public market data (prices, fund holdings, fees) fetched by the server. Safe to delete. | `tools/market.ts` |
| `data/private/server.log` | Log of the always-on server. | `tools/server.ts` |
| `data/private/inspector/` | Optional diagnostics saved from the Inspector page in dev (counts only). | `tools/dev-save.ts` |

Example `history.csv` (fictional):

```csv
date,recordedAt,accountKey,bucket,balance
2026-01-31,2026-02-01T03:00:00.000Z,a_0000000000000001,cash,2500.00
2026-01-31,2026-02-01T03:00:00.000Z,a_0000000000000002,investments,12000.00
2026-01-31,2026-02-01T03:00:00.000Z,a_0000000000000003,debt,-350.25
```

You never need to create anything here by hand.
