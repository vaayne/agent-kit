---
name: gws
description: Use the `gws` CLI to interact with Google Workspace services — Gmail, Drive, Sheets, Calendar, Docs, Tasks, Chat, and more. Trigger this skill whenever the user wants to read/send email, manage Drive files, update spreadsheets, check calendars, create tasks, send Chat messages, or run any Google Workspace operation. Also trigger when the user mentions Google Workspace, Google APIs, or asks to automate anything across Gmail/Drive/Sheets/Calendar/Docs/Tasks/Chat. Use this skill even when the request seems simple — gws can handle it in one command.
---

# gws — Google Workspace CLI

```bash
gws <service> <resource> [sub-resource] <method> [flags]
```

Helpers prefixed with `+` are high-level shortcuts — prefer them. Run `gws <service> --help` to discover all commands.

## Key Flags

| Flag                        | Purpose                          |
| --------------------------- | -------------------------------- |
| `--params '{"k":"v"}'`      | URL/query parameters             |
| `--json '{"k":"v"}'`        | Request body                     |
| `--format table\|yaml\|csv` | Output format (default: json)    |
| `--dry-run`                 | Validate without calling the API |
| `--page-all`                | Auto-paginate (NDJSON)           |
| `--upload <PATH>`           | Upload file (multipart)          |

## Shell Quoting

- Wrap `--params`/`--json` in **single quotes**: `--params '{"pageSize":10}'`
- Sheet ranges contain `!` which zsh expands. Use **double quotes**: `--range "Sheet1!A1:D10"` (never single quotes)

## Services

### Gmail

```bash
gws gmail +triage                                                        # unread summary
gws gmail +send --to a@b.com --subject "Hi" --body "Hello"
gws gmail +read --message-id MSG_ID
gws gmail +reply --message-id MSG_ID --body "Thanks"
gws gmail users messages list --params '{"userId":"me","q":"is:unread"}'
```

### Drive

```bash
gws drive files list --params '{"pageSize":10}'
gws drive +upload --file ./report.pdf --name "Q4 Report" --parent FOLDER_ID
gws drive permissions create --params '{"fileId":"FILE_ID"}' \
  --json '{"role":"reader","type":"user","emailAddress":"user@co.com"}'
```

### Sheets

```bash
gws sheets +read --spreadsheet SHEET_ID --range "Sheet1!A1:D10"
gws sheets +append --spreadsheet SHEET_ID --range "Sheet1" --values '[["Alice",30]]'
```

### Calendar

```bash
gws calendar +agenda
gws calendar +insert --summary "Sync" --start "2026-05-01T10:00:00" \
  --end "2026-05-01T11:00:00" --attendees "a@co.com,b@co.com"
gws calendar events list --params '{"calendarId":"primary","maxResults":10}'
```

### Docs / Tasks / Chat

```bash
gws docs documents get --params '{"documentId":"DOC_ID"}'
gws docs +write --document DOC_ID --text "Appended text"
gws tasks tasks list --params '{"tasklist":"@default"}'
gws tasks tasks insert --params '{"tasklist":"@default"}' --json '{"title":"Review PR"}'
gws chat +send --space SPACE_ID --text "Deploy complete"
```

### Cross-Service Workflows

```bash
gws workflow +standup-report                              # meetings + open tasks
gws workflow +meeting-prep                                # next meeting agenda
gws workflow +email-to-task --message-id MSG_ID           # email → task
gws workflow +file-announce --file FILE_ID --space SPACE_ID
```

### Schema Discovery

```bash
gws schema drive.files.list                              # param + response shape
gws schema sheets.spreadsheets.values.get --resolve-refs
```

## Common Flows

### Gmail Filter (auto-label incoming messages)

```bash
gws gmail users labels list --params '{"userId":"me"}' --format table
gws gmail users labels create --params '{"userId":"me"}' --json '{"name":"Receipts"}'
# Use returned label id below
gws gmail users settings filters create --params '{"userId":"me"}' \
  --json '{"criteria":{"from":"receipts@example.com"},"action":{"addLabelIds":["LABEL_ID"],"removeLabelIds":["INBOX"]}}'
gws gmail users settings filters list --params '{"userId":"me"}' --format table
```

### Upload → Share → Announce

```bash
gws drive +upload --file ./report.pdf --name "Q4 Report 2026"
gws drive permissions create --params '{"fileId":"FILE_ID","sendNotificationEmail":true}' \
  --json '{"role":"reader","type":"user","emailAddress":"colleague@co.com"}'
gws workflow +file-announce --file FILE_ID --space SPACE_ID
```

### Sheet Update + Chat Notify

```bash
gws sheets +append --spreadsheet SHEET_ID --range "Sheet1" \
  --values '[["2026-04-26","Alice",142.50,"Closed"]]'
gws chat +send --space SPACE_ID --text "New row added to pipeline sheet."
```

### Morning Standup

```bash
gws workflow +standup-report && gws gmail +triage
```

## Security

- Never emit tokens or credentials in output.
- Confirm with the user before any write or delete command.
- Use `--dry-run` before destructive operations.

## Auth

```bash
gws auth login                                     # browser OAuth
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json  # service account
```

Community: <https://github.com/googleworkspace/cli>
