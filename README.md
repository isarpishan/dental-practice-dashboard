# Dental Practice Dashboard

A local dashboard for a dental practice in Austria. It reads the PDF reports that the practice
software exports, plus the bank account statements, checks every total, and shows how the
practice develops: year against year, quarter against quarter, service by service, and what
actually went through the bank account.

*Lokales Auswertungs-Panel für eine Zahnarztordination in Österreich: Patienten- und
Leistungsstatistiken, BIZ-Auswertungen und Kontoauszüge als PDF einlesen, Jahre und Quartale
vergleichen, Einnahmen und Ausgaben zuordnen. Oberfläche auf Deutsch (de-AT), Analysebericht
auf Persisch.*

Everything runs on your own Mac. There is no login, no cloud and no connection to the practice
software: you add the exported PDFs, the panel checks them, and only then takes them over.

## What you can do with it

- **Overview** — the last complete quarter, then any year, comparison year and period
  (quarter, Jänner–September, whole year): value of services, treated persons, value per person
- **Year view** (*Jahresübersicht*) — one year at a glance: totals, quarters and service areas
- **Patients** — new patients and sessions (BIZ), age distribution, persons per quarter
- **Services** (*Leistungen*) — every service code with its real historical amounts, grouped
  into areas (prosthetics, implants, periodontology & laser, root canal, X-ray, …), with the
  biggest gains and losses between two years
- **Treatments & planning** — planned (red) lines of the annual service list are read by their
  actual text colour and kept apart from services already performed
- **Patient history** (*Patientenverlauf*) — which anonymous patients came in one year but not
  in the next, and which are new; each line links to the page in the original PDF
- **Income & expenses** (*Einnahmen & Ausgaben*) — bank statements read to the cent: income,
  expenses, change of the account balance, monthly averages, costs by category and payee.
  Each payment can be marked as practice or private in the panel.
- **Persian analysis report** — a written report (in Persian) built from the same numbers, with
  charts and tables, downloadable as PDF
- **Files & update** (*Dateien & Aktualisieren*) — add new PDFs, see a preview of what would
  change, then confirm. Export all tables as CSV for Excel or Numbers, download a backup.

## Built to avoid wrong conclusions

- Every report is checked against its own printed totals before it is used. A file that does
  not add up, or has an unknown layout, blocks the import instead of being guessed.
- Incomplete periods get no growth rate. Missing data stays empty — never counted as 0.
- Unique patients of several quarters are never added up to a yearly number.
- Value of services is not income, and a change of the bank balance is not profit. The panel
  says so wherever it matters.
- If a newer export of the same report and period arrives, it replaces the older one;
  identical files are recognised by content, even under another name.
- Overlapping bank exports are merged booking by booking and reconciled with the printed
  daily balances.
- Optional: patients of a care-home cooperation (*Pflegeheim*) can be separated from the
  practice for one year, matched exactly against the care-home statistics.

## Privacy

- Patient names, birth dates, insurance numbers, tooth numbers and clinical notes are never
  stored. Patients appear only as a salted pseudonymous reference (`Patient 3F9A…`).
- Private names in bank bookings from individuals are hidden in the views; IBANs and long
  references are masked.
- Names of payees you want to sort (landlord, lab, colleagues) live only in your local
  `bank-rules.json`, which is never committed.
- The server listens only on `127.0.0.1` and refuses requests from other origins.

No patient data, bank data or practice figures are part of this repository.

## How it works

```
PDF exports ─▶ dashboard-tools/prepare_data.py ─▶ reviewed snapshot (data.json)
                 (parse, check totals, pseudonymise)        │
                                                            ├─▶ dashboard/  (German panel)
                                                            └─▶ bericht/    (Persian report)
serve.py: local server on 127.0.0.1:4187 — import preview, confirm, rebuild, exports, backups
import_store.py: every confirmed import is stored in a local SQLite database with its sources
```

| Path | What |
|---|---|
| `dashboard-tools/prepare_data.py` | reads all supported PDFs and builds the reviewed snapshot |
| `dashboard-tools/patient_service_data.py` | annual service list: text colour, planned vs. performed, pseudonyms |
| `dashboard-tools/bank_data.py` | bank statements: cents, balances, overlap, categories |
| `dashboard-tools/practice_scope.py`, `care_home.py` | optional care-home separation |
| `dashboard-tools/serve.py`, `import_workflow.py`, `import_store.py` | local server, two-step import, SQLite history |
| `dashboard-tools/data_exports.py` | CSV export and ZIP backups |
| `dashboard-tools/LocalPanel.swift`, `build_local_app.py` | small macOS launcher app (*Ordinationspanel*) |
| `dashboard-tools/ReportPDF.swift`, `report_pdf_data.mjs` | PDF export of the Persian report |
| `dashboard/src/content/` | the dashboard views (React) |
| `bericht/src/content/` | the Persian analysis report (React) |

### Supported PDF reports

Text-based PDF exports in the layouts the practice software produces:

- *Patientenstatistik* (year or quarter) — persons, service lines, amount, age, gender, insurance
- *Auswertung der Leistungen* (01.01.–31.12.) — amount, patient and insurance share per code
- *BIZstatistik* (year/quarter) — new patients, sessions, open and completed plans
- *Lexikon* — current prices and descriptions of the service codes
- *Leistungsaufstellung für das Jahr …* — annual service list per patient, with planned lines in red
- bank *Umsatzübersicht* exports

Other layouts, scanned (image) PDFs, CSV and Excel files are reported as "needs review" and not
imported. Put the files in the project folder, in `Leistungsaufstellung/` or in `Eingang/`.

## Getting started

The user interface is built on the **Data** plugin of OpenAI Codex (its React runtime, charts,
tables and build tool). That runtime is proprietary and **not included** here. This repository
contains the practice-specific code only: the importer, the local server and the content of the
two apps.

Requirements: macOS, Python 3.12 with `pypdf`, OpenAI Codex with the Data plugin installed.

1. Create two Data apps with the plugin — a dashboard in `dashboard/` and a report in
   `bericht/` — and copy this repository's `src/content/` folders over them.
2. Bundle the local runtime (Python, Node and the plugin) into `.local-runtime/`:
   ```bash
   python3 dashboard-tools/package_runtime.py   # set CODEX_RUNTIME_DIR / DATA_PLUGIN_DIR if needed
   ```
3. Create your local settings from the examples:
   ```bash
   cd dashboard-tools
   cp patient-service-context.example.json patient-service-context.json   # set your own random salt
   cp bank-rules.example.json bank-rules.json                             # optional: your payees
   cp practice-context.example.json practice-context.json                 # optional: vacation weeks
   cp pflegeheim-finance-context.example.json pflegeheim-finance-context.json  # optional: care home
   ```
4. Add your PDF exports, then read them and build both apps:
   ```bash
   ORDI_BUILD_STATUS=complete .local-runtime/python/bin/python3 dashboard-tools/prepare_data.py
   .local-runtime/python/bin/python3 dashboard-tools/rebuild.py
   ```
5. Start the panel:
   ```bash
   .local-runtime/python/bin/python3 dashboard-tools/serve.py   # → http://127.0.0.1:4187/
   ```
   Or build the launcher app once with `python3 dashboard-tools/build_local_app.py` and open
   `Ordinationspanel.app` (or `Dashboard starten.command`).

After that, new PDFs are added from the panel under *Dateien & Aktualisieren*.

### Local settings

| File | Needed | What |
|---|---|---|
| `patient-service-context.json` | yes | salt for the pseudonymous patient references |
| `bank-rules.json` | no | your own payee rules: name → practice/private, category |
| `practice-context.json` | no | vacation weeks per month, shown next to comparisons |
| `pflegeheim-finance-context.json` | no | year, patient list and partner of a care-home cooperation |
| `bank-assignments.json` | created by the panel | payments you sorted by hand |

All of them are git-ignored. Backups (`Sicherungen/`) and the local database (`.local-state/`)
contain practice data and are git-ignored as well.

Check: `python3 dashboard-tools/verify_source_documents.py` (only catalogued, unchanged PDFs inside
the project folder can be opened from the panel).

## Notes

- The service-code groups in `category()` (`prepare_data.py`) follow one practice's codes.
  Adjust them to your own *Lexikon*.
- The importer supports the reviewed PDF layouts only. A new layout needs one sample export and
  a parser before it is accepted.
- Nothing in this project is tax, legal or medical advice. Practice/private splits in the
  panel are a management view, not a tax assessment.

## License

[MIT](LICENSE) for the code in this repository. You may use, change and share it freely. It is
provided "as is", without any warranty, and the authors are not liable for any damage or loss
from its use. The OpenAI Codex Data plugin runtime is not covered by this license and is not
part of this repository.
