---
name: cmail
description: |
  Manage Cloud Mail (Skymail) domain email through the bundled Python CLI. Use this
  skill whenever the user asks to inspect, search, send, reply to, forward, or delete
  domain email; list, add, or remove mailboxes; manage domain users; inspect or delete
  all-domain mail; or manage registration codes. Trigger even when the user says only
  “域名邮箱”, “收件箱”, “邮箱账号”, “Cloud Mail”, “Skymail”, or “cmail”. The CLI
  reads CMAIL_HOST, CMAIL_EMAIL, and CMAIL_PASSWORD from the environment and must be
  used instead of hand-written curl requests.
metadata:
  source: https://doc.skymail.ink/api/api-doc
  env: CMAIL_HOST,CMAIL_EMAIL,CMAIL_PASSWORD
---

# CMail domain email

Use `scripts/cmail.py` for all Cloud Mail API calls. Replace `<skill-dir>` below with
the absolute directory containing this `SKILL.md`; do not assume the user's current
working directory is the repository.

```bash
SCRIPT="<skill-dir>/scripts/cmail.py"
python "$SCRIPT" --help
```

## Authentication

The runtime must provide:

```text
CMAIL_HOST       Cloud Mail server URL, for example https://mail.example.com
CMAIL_EMAIL      Login email, normally an administrator for domain management
CMAIL_PASSWORD   Login password
CMAIL_USER_AGENT Optional; defaults to curl/8.0.0 for Cloudflare compatibility
CMAIL_ALLOW_INSECURE_HTTP Optional; set to 1 only for a remote HTTP server
```

`CMAIL_HOST` may end in `/api`; the CLI normalizes it. Never ask the user to paste these
secrets into chat, print them, put them in command arguments, or include them in a
report. The CLI logs in with `POST /api/login` when no valid cached token is available
and sends the returned token directly as `Authorization`; it does not use the
deprecated public API or add a `Bearer` prefix. It sends a curl-compatible User-Agent by
default because some Cloudflare deployments reject Python's default User-Agent; override
it with `CMAIL_USER_AGENT` only when the reverse proxy requires a different value.
Remote hosts must use HTTPS by default. HTTP is allowed for localhost and loopback IPs;
set `CMAIL_ALLOW_INSECURE_HTTP=1` only when the user explicitly accepts plaintext
credential and token transport.

After a successful login, the CLI caches the token in `~/.cache/cmail/token.json` with
0600 permissions. Set `CMAIL_TOKEN_CACHE` to use another path. The cache is scoped to
the normalized host and login email; a 401/403 with a cached token invalidates it and
causes one fresh login before retrying the request. If the server still returns 403,
report the permission or server-side authentication failure rather than retrying.

Start with `me` when permissions or the account id are unclear:

```bash
python "$SCRIPT" me
python "$SCRIPT" account list
```

Admin commands require the login account to have the corresponding permission. If they
fail with an authorization error, report that fact and do not retry repeatedly.

## Common operations

The CLI prints the API response as JSON and exits non-zero on configuration, validation,
network, or API errors.

```bash
# 当前邮箱的收件邮件摘要；--type 1 查询发件邮件
python "$SCRIPT" mail list --account-id 1 --size 10

# 明确需要正文和附件时再拉取完整邮件
python "$SCRIPT" mail list --account-id 1 --size 10 --full 1

# 发送 HTML 邮件；正文较长时优先使用 --content-file
python "$SCRIPT" mail send \
  --account-id 1 \
  --to recipient@example.com \
  --subject "主题" \
  --content '<p>正文</p>'

# 回复邮件
python "$SCRIPT" mail send \
  --account-id 1 \
  --to recipient@example.com \
  --subject "Re: 主题" \
  --content '<p>回复</p>' \
  --send-type reply \
  --email-id 123

# 添加邮箱地址
python "$SCRIPT" account add --email alias@example.com

# 管理员查看用户和全域邮件
python "$SCRIPT" users list
python "$SCRIPT" all-mail list --user-email example.com --size 20

# 附件可重复，最多 10 个
python "$SCRIPT" mail send ... --attachment ./report.pdf --attachment ./image.png
```

Other command groups are discoverable through `--help`:

- `account list|add|delete` manages the logged-in user's mailbox addresses.
- `mail list|send|delete` manages that user's mail.
- `users list|add|status|delete` manages domain users and requires admin permission.
- `all-mail list|delete` manages mail across users; deletion is permanent.
- `regkey list|add|history|delete` manages registration codes.

## Safety rules

Treat sending mail, adding users, changing user status, and adding accounts as external
side effects. Check the final recipient list, account id, subject, and requested change
before executing them. If the user's request is ambiguous, ask one focused question.

Every delete subcommand requires `--yes`. Add it only when the user has explicitly
authorized that exact deletion. `users delete`, `all-mail delete`, and `regkey delete`
are irreversible; `account delete` and `mail delete` may also become permanent depending
on server settings. If a write times out, query the resource before retrying because the
server may have completed it.

For `users add`, prefer `--password-stdin` or the interactive prompt. Do not put a new
user's password in chat or a shell command line unless the user explicitly accepts that
risk. The bundled CLI validates documented limits, including 6-character user passwords,
mailbox-list size 30, user/mail-list size 50, and 10 attachments.

## API reference

Read [references/api.md](references/api.md) when the user asks about an endpoint,
pagination cursor, response field, permission boundary, or an operation not covered by
the examples. The reference tracks the documented non-deprecated API; do not resurrect
the `开放 API（已弃用）` endpoints.
