---
name: cf-email
description: Send emails via the Cloudflare Email Sending REST API. Trigger this skill when the user wants to send an email using Cloudflare's email service. Use curl directly with credentials from environment variables.
---

# cf-email — Cloudflare Email Sending

Sends transactional email via the Cloudflare Email Sending REST API using `curl`.

## Environment Variables

| Variable                | Description                                        |
| ----------------------- | -------------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID                              |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare API token with email sending permission |

## Endpoint

```
POST https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/email/sending/send
```

## Request Fields

| Field         | Type                       | Required | Description                                      |
| ------------- | -------------------------- | -------- | ------------------------------------------------ |
| `to`          | string or string[]         | Yes      | Recipient(s), max 50 combined with cc/bcc        |
| `from`        | string or `{address,name}` | Yes      | Sender — object form uses `address`, not `email` |
| `subject`     | string                     | Yes      | Email subject line                               |
| `html`        | string                     | No*      | HTML body                                        |
| `text`        | string                     | No*      | Plain text body                                  |
| `cc`          | string or string[]         | No       | CC recipients                                    |
| `bcc`         | string or string[]         | No       | BCC recipients                                   |
| `reply_to`    | string or `{address,name}` | No       | Snake_case                                       |
| `attachments` | array                      | No       | File attachments and inline images               |
| `headers`     | object                     | No       | Custom email headers                             |

*At least one of `html` or `text` required. Include both for best deliverability.

## Usage

### Plain text

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/email/sending/send" \
  --header "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  --header "Content-Type: application/json" \
  --data '{
    "to": "user@example.com",
    "from": {"address": "you@yourdomain.com", "name": "Your Name"},
    "subject": "Hello",
    "text": "Hello from Cloudflare.",
    "html": "<p>Hello from Cloudflare.</p>"
  }'
```

### Multiple recipients with CC/BCC

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/email/sending/send" \
  --header "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  --header "Content-Type: application/json" \
  --data '{
    "to": ["user1@example.com", "user2@example.com"],
    "cc": ["manager@company.com"],
    "bcc": ["archive@company.com"],
    "from": {"address": "orders@yourdomain.com", "name": "Orders"},
    "reply_to": "support@yourdomain.com",
    "subject": "Order Confirmation",
    "html": "<h1>Your order is confirmed</h1>",
    "text": "Your order is confirmed"
  }'
```

### With file attachment

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/email/sending/send" \
  --header "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  --header "Content-Type: application/json" \
  --data '{
    "to": "customer@example.com",
    "from": {"address": "invoices@yourdomain.com", "name": "Invoices"},
    "subject": "Your Invoice",
    "html": "<h1>Invoice attached</h1>",
    "text": "Invoice attached.",
    "attachments": [
      {
        "content": "JVBERi0xLjQK...",
        "filename": "invoice.pdf",
        "type": "application/pdf",
        "disposition": "attachment"
      }
    ]
  }'
```

### With inline image

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/email/sending/send" \
  --header "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  --header "Content-Type: application/json" \
  --data '{
    "to": "user@example.com",
    "from": {"address": "newsletter@yourdomain.com", "name": "Newsletter"},
    "subject": "Check this out",
    "html": "<h1>Hello!</h1><img src=\"cid:logo\">",
    "attachments": [
      {
        "content": "iVBORw0KGgoAAAANSUhEUg...",
        "filename": "logo.png",
        "type": "image/png",
        "disposition": "inline",
        "content_id": "logo"
      }
    ]
  }'
```

### With custom headers (e.g. unsubscribe)

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/email/sending/send" \
  --header "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  --header "Content-Type: application/json" \
  --data '{
    "to": "user@example.com",
    "from": {"address": "notifications@yourdomain.com", "name": "Notifications"},
    "subject": "Weekly digest",
    "html": "<h1>Weekly Digest</h1>",
    "text": "Weekly Digest",
    "headers": {
      "List-Unsubscribe": "<https://yourdomain.com/unsubscribe?id=abc123>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
    }
  }'
```

## Response

```json
{
  "success": true,
  "errors": [],
  "messages": [],
  "result": {
    "delivered": ["recipient@example.com"],
    "permanent_bounces": [],
    "queued": []
  }
}
```

`success: true` with empty `delivered`/`queued` arrays is normal — Cloudflare accepted the message.

## Error Handling

| Status | Meaning          | Retry?                    |
| ------ | ---------------- | ------------------------- |
| 200    | Success          | N/A                       |
| 400    | Validation error | No — fix the request      |
| 401    | Invalid token    | No — check your token     |
| 429    | Rate limited     | Yes — exponential backoff |
| 500    | Server error     | Yes — exponential backoff |

## Workflow

1. Confirm recipient, subject, and body with the user.
2. Echo the JSON payload to confirm it looks right before sending.
3. Send with curl and check `success` in the response.
4. Report `delivered`, `queued`, or `permanent_bounces` from the result.
