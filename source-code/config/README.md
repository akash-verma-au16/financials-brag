# config/

`config/settings.json` is the app's own settings file. **It is personal, git-ignored, and not
shipped** — the original author's copy held their spending rules (merchant names from their own
statements), account labels, Google Sheet IDs and birth year.

You don't need to create it: the app writes it the first time you change a setting (through the
local server, `tools/api.ts`), and keeps it in sync with the browser (newest edit wins —
`src/data/appDataSync.ts`). `settings.example.json` shows the shape with fictional values.

| Key | What it is | How you set it |
| --- | --- | --- |
| `people` | Household members. `me` is the default owner. | Settings → Household |
| `accountOwners` | Account key → owner ids (joint accounts are split equally). | Accounts page |
| `accountLabels` | Account key → your display name for it. | Accounts page |
| `closedAccounts` | Account key → date it was closed (hidden after that). | Accounts page |
| `rules` | Your own merchant → category overrides (`match` is a case-insensitive substring; optional `direction`: `in`/`out`). Built-in rules live in `src/data/categories.ts`. | Spending → recategorise a transaction |
| `circle` | Names (yours, family's) as they appear on e-Transfers, so money moving between you isn't counted as spending. | Settings |
| `roomExclusions` | Transactions to leave out of the contribution-room totals. | Room page |
| `birthYear` | Optional, for ages on projections. | Projections page |
| `marketLinks` | Holding → market symbol (for prices/fund look-through) when it can't be matched automatically. | Holding detail page |
| `feeOverrides`, `instrumentOverrides` | Manual fund fees / asset-class overrides. | Holding detail page |
| `taxRate` | Marginal tax rate used in calculators. | Settings |
| `sources` | The Google Sheets you added (ID + title only, never cell data). | Data page → paste a sheet link |

Account keys (`a_` + 16 hex) are hashes of institution + account number (`src/data/build.ts`), so
raw account numbers are never stored.
