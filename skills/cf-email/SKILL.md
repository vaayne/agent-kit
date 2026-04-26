---
name: cf-email
description: Send emails via the Cloudflare Email Sending REST API. Trigger this skill when the user wants to send an email using Cloudflare's email service. Supports plain text, HTML, attachments, inline images, CC/BCC, reply-to, and custom headers. Uses a Python helper script that reads credentials from environment variables.
---

# cf-email — Cloudflare Email Sending

Sends transactional email via the Cloudflare Email Sending REST API using `send_email.py`.

## Environment Variables

| Variable                | Description                                        |
| ----------------------- | -------------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID                              |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare API token with email sending permission |

Set these in your shell profile or `.env` file before running the script.

## Script Location

```
skills/cf-email/scripts/send_email.py
```

Run with:

```bash
uv run --script skills/cf-email/scripts/send_email.py [OPTIONS]
```

## Usage

### Basic send

```bash
uv run --script skills/cf-email/scripts/send_email.py \
  --to user@example.com \
  --subject "Hello" \
  --text "Hello from Cloudflare"
```

### HTML email with CC/BCC

```bash
uv run --script skills/cf-email/scripts/send_email.py \
  --to user@example.com \
  --cc manager@company.com \
  --bcc archive@company.com \
  --subject "Order Confirmation" \
  --html "<h1>Your order is confirmed</h1>" \
  --text "Your order is confirmed"
```

### Custom sender name and reply-to

```bash
uv run --script skills/cf-email/scripts/send_email.py \
  --to customer@example.com \
  --from-address orders@yourdomain.com \
  --from-name "Orders Team" \
  --reply-to support@yourdomain.com \
  --subject "Order shipped" \
  --text "Your order is on its way"
```

### With file attachment

```bash
uv run --script skills/cf-email/scripts/send_email.py \
  --to customer@example.com \
  --subject "Your Invoice" \
  --html "<h1>Invoice attached</h1>" \
  --attach invoice.pdf
```

### Dry run (validate without sending)

```bash
uv run --script skills/cf-email/scripts/send_email.py \
  --to user@example.com \
  --subject "Test" \
  --text "Test body" \
  --dry-run
```

## Options Reference

| Option           | Description                                          |
| ---------------- | ---------------------------------------------------- |
| `--to`           | Recipient(s), repeatable                             |
| `--cc`           | CC recipient(s), repeatable                          |
| `--bcc`          | BCC recipient(s), repeatable                         |
| `--from-address` | Sender address                                       |
| `--from-name`    | Sender display name                                  |
| `--reply-to`     | Reply-to address                                     |
| `--subject`      | Email subject (required)                             |
| `--text`         | Plain text body                                      |
| `--html`         | HTML body (string or `@file.html` to read from file) |
| `--attach`       | File path to attach, repeatable                      |
| `--header`       | Custom header as `Key: Value`, repeatable            |
| `--dry-run`      | Print payload without sending                        |

At least one of `--text` or `--html` is required.

## Error Codes

| HTTP Status | Meaning           | Retry?                    |
| ----------- | ----------------- | ------------------------- |
| 200         | Success           | N/A                       |
| 400         | Validation error  | No                        |
| 401         | Invalid API token | No                        |
| 429         | Rate limited      | Yes — exponential backoff |
| 500         | Server error      | Yes — exponential backoff |

## Workflow

1. Confirm recipient, subject, and body with the user.
2. Check that `CF_ACCOUNT_ID`, `CF_EMAIL_API_TOKEN`, and `CF_EMAIL_FROM` are set (or `--from-address` is provided).
3. Run with `--dry-run` first to preview the payload.
4. Remove `--dry-run` to send.
5. Report `delivered`, `queued`, or `permanent_bounces` from the response.
