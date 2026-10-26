# Local import and evidence storage

The panel remains loopback-only. `import_store.py` uses Python's bundled SQLite and requires no service, account or cloud key. The database is `.local-state/ordination.sqlite3` (0600).

## Data flow

1. `/api/ordi/preview` validates original PDFs, stages new bytes under `.local-state/imports/<random-token>/`, and calls the same `prepare_data.build(..., persist=False)` as the real importer. No active snapshot, original archive or database run is changed.
2. The plan binds the current snapshot version, all source hashes, rule/importer hashes, and each staged file's hash. Plans expire after 24 hours. Only a supported and reconciled whole batch can be applied. Disclosed existing issues remain separate from new blockers.
3. `/api/ordi/import-apply` requires that plan. It creates a backup, promotes copies to `Eingang/`, rebuilds both existing apps and commits one SQLite transaction. Failures restore the prior snapshots, status and compiled views and remove the promoted copies. The failed plan can be retried after correcting its cause, or discarded.
4. Source files are never overwritten. Exact binary duplicates are skipped. Supported aggregate families use one newest valid version per report period, not sums of snapshots. Different versions with equal creation timestamps fail closed. Existing overlap-aware bank reconciliation remains unchanged.

## Schema

- `runs`: immutable compressed complete snapshots and observation cutoffs.
- `sources` / `source_versions`: content identities and per-run location, type, reporting period and use.
- `datasets` / `facts` / `run_datasets`: versioned reviewed tables with lineage, indexed year/quarter/date/pseudonymous references and integer cents. Unchanged tables are reused across runs. Null remains unknown.
- `rules`: per-run contexts and exact rule/importer source versions. The patient anonymization salt is excluded from this table; it remains in its existing local context file and full backups.

Existing generated JSON is the presentation snapshot. Confirmed imports preserve that exact snapshot in SQLite and record its query tables; this is not a switch to calculating totals by adding all historical database runs. Bank, service, planning and original/scoped queries remain distinct. Restoring a historical run through the UI is not implemented.

`backup_database()` uses SQLite's online backup API for a consistent archive member. ZIP backups include the database and its checksum. CSV exports include source inventory and the latest 20 runs; complete history stays in SQLite.

## Supported scope and limitations

The importer supports the already reviewed PDF layouts. A new monthly or appointment layout, CSV or spreadsheet needs one original specimen and an explicit parser/coverage definition before activation. Annual patient service lists remain full-year snapshots with stable pseudonymous references; they are not monthly deltas. Printed totals and colour checks remain mandatory. No duration is inferred from procedure codes, fees, export metadata or dates alone.

No LLM or RAG endpoint is enabled. Any future analytical assistant must query one selected reviewed run and its scoped datasets for numeric answers; retrieval can supply source explanations and rule context. It must not sum documents or invent unavailable data.

## Checks

Run `verify_source_documents.py` to check that only catalogued, unchanged PDFs inside the project folder can be opened. The real browser flow should also test folder preview, explicit apply, duplicate selection, discard and table/backup downloads.
