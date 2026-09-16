# Cloud Mail API mapping

Source: <https://doc.skymail.ink/api/api-doc>

The CLI appends `/api` to `CMAIL_HOST` unless the host already ends in `/api`. All
authenticated requests send the login token as the raw `Authorization` header value.
Remote hosts must use HTTPS unless `CMAIL_ALLOW_INSECURE_HTTP=1` is explicitly set;
localhost and loopback IPs may use HTTP for local testing. Mail list commands default to
`full=0` to return summaries; pass `--full 1` only when the body and attachments are needed.
The login endpoint itself is unauthenticated. The CLI caches the token per normalized
host and login email in `~/.cache/cmail/token.json` (or `CMAIL_TOKEN_CACHE`) with 0600
permissions, and refreshes a cached token once after HTTP 401/403. Its default
User-Agent is `curl/8.0.0`; override it with `CMAIL_USER_AGENT` if the proxy requires
another value.

| CLI command       | Method | Endpoint                | Notes                                                    |
| ----------------- | ------ | ----------------------- | -------------------------------------------------------- |
| `me`              | GET    | `/api/my/loginUserInfo` | Current user, role, permissions, primary account         |
| `account list`    | GET    | `/api/account/list`     | Cursor pagination; max `size=30`                         |
| `account add`     | POST   | `/api/account/add`      | Domain must be configured; optional verification token   |
| `account delete`  | DELETE | `/api/account/delete`   | Cannot delete the login mailbox; CLI requires `--yes`    |
| `mail list`       | GET    | `/api/email/list`       | Current user's mail; max `size=50`                       |
| `mail send`       | POST   | `/api/email/send`       | HTML body; max 10 attachments                            |
| `mail delete`     | DELETE | `/api/email/delete`     | Usually soft delete; CLI requires `--yes`                |
| `users list`      | GET    | `/api/user/list`        | Admin; page size max 50                                  |
| `users add`       | POST   | `/api/user/add`         | Admin; new password must be at least 6 characters        |
| `users status`    | PUT    | `/api/user/setStatus`   | `0` normal, `1` disabled; disabling invalidates sessions |
| `users delete`    | DELETE | `/api/user/delete`      | Admin; permanently deletes the user and related data     |
| `all-mail list`   | GET    | `/api/allEmail/list`    | Admin; cursor by `emailId`, page size max 50             |
| `all-mail delete` | DELETE | `/api/allEmail/delete`  | Admin; permanently deletes mail, attachments, and stars  |
| `regkey list`     | GET    | `/api/regKey/list`      | Admin; optional code-prefix filter                       |
| `regkey add`      | POST   | `/api/regKey/add`       | Admin; code, role id, count, expiry date                 |
| `regkey history`  | GET    | `/api/regKey/history`   | Admin; requires registration-code id                     |
| `regkey delete`   | DELETE | `/api/regKey/delete`    | Admin; CLI requires `--yes`                              |

## Pagination and filters

- `mail list`: pass `--email-id` from the previous page and optionally `--time-sort 0`
  or `1`; `--type 0` is received mail and `--type 1` is sent mail.
- `account list`: pass the previous page's final `accountId` and `sort` as
  `--account-id` and `--last-sort`.
- `all-mail list`: use `--type all|receive|send|delete|noone`, plus `--name`,
  `--subject`, `--user-email`, or `--account-email` for prefix filters.
- `users list`: `--status 0|1` filters active/disabled users; omit it to avoid that
  filter. `--is-del 0|1` selects normal/deleted users.

The API wraps successful responses as `{ "code": 200, "message": "success", "data": ... }`.
The CLI preserves that envelope in stdout and reports non-200 API responses on stderr.
