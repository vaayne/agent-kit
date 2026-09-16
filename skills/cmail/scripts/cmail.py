"""Command-line client for the Cloud Mail HTTP API."""

from __future__ import annotations

import argparse
import base64
import getpass
import ipaddress
import json
import mimetypes
import os
import sys
import tempfile
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen

DEFAULT_TIMEOUT = 30.0
DEFAULT_USER_AGENT = "curl/8.0.0"
MAX_ATTACHMENTS = 10
INSECURE_HTTP_TRUE_VALUES = {"1", "true", "yes", "on"}
JsonObject = dict[str, Any]


class CMailError(Exception):
    """An expected configuration, input, or remote API error."""


class ApiError(CMailError):
    """An API response that cannot be treated as successful."""

    def __init__(self, message: str, *, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


def _required_env(name: str) -> str:
    value = os.environ.get(name)
    if value is None or value == "":
        raise CMailError(f"缺少环境变量 {name}")
    return value


def _token_cache_path() -> Path:
    configured = os.environ.get("CMAIL_TOKEN_CACHE")
    if configured:
        return Path(configured).expanduser()
    return Path.home() / ".cache" / "cmail" / "token.json"


def _env_flag(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in INSECURE_HTTP_TRUE_VALUES


def _is_loopback_hostname(hostname: str | None) -> bool:
    if hostname is None:
        return False
    if hostname.lower() == "localhost":
        return True
    try:
        return ipaddress.ip_address(hostname).is_loopback
    except ValueError:
        return False


def _api_root(host: str, *, allow_insecure_http: bool = False) -> str:
    """Normalize CMAIL_HOST while allowing the server root or its /api root."""

    parsed = urlsplit(host.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise CMailError("CMAIL_HOST 必须是带 http:// 或 https:// 的 URL")
    if parsed.query or parsed.fragment:
        raise CMailError("CMAIL_HOST 不能包含 query string 或 fragment")
    if (
        parsed.scheme == "http"
        and not allow_insecure_http
        and not _is_loopback_hostname(parsed.hostname)
    ):
        raise CMailError(
            "远程 CMAIL_HOST 必须使用 HTTPS；仅本机地址默认允许 HTTP，"
            "如确需远程明文连接，请设置 CMAIL_ALLOW_INSECURE_HTTP=1"
        )

    path = parsed.path.rstrip("/")
    if not path.endswith("/api"):
        path += "/api"
    return urlunsplit((parsed.scheme, parsed.netloc, path, "", ""))


def _parse_json(raw: bytes, *, status: int | None = None) -> JsonObject:
    if not raw:
        return {"code": status or 204, "message": "success", "data": None}
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ApiError("服务器返回了无法解析的 JSON", status=status) from exc
    if not isinstance(payload, dict):
        raise ApiError("服务器返回的 JSON 不是对象", status=status)
    return payload


def _api_message(payload: JsonObject) -> str:
    message = payload.get("message") or payload.get("error")
    return message if isinstance(message, str) else "远端 API 返回失败"


def _split_values(values: list[str], label: str) -> list[str]:
    items = [item.strip() for value in values for item in value.split(",")]
    items = [item for item in items if item]
    if not items:
        raise CMailError(f"{label} 不能为空")
    return items


def _ids(values: list[str], label: str) -> str:
    items = _split_values(values, label)
    for item in items:
        if not item.isdigit() or int(item) < 1:
            raise CMailError(f"{label} 必须是正整数，用逗号分隔")
    return ",".join(items)


def _positive_int(value: str) -> int:
    parsed = int(value)
    if parsed < 1:
        raise argparse.ArgumentTypeError("必须是正整数")
    return parsed


def _size(value: str) -> int:
    parsed = _positive_int(value)
    if parsed > 50:
        raise argparse.ArgumentTypeError("最大值为 50")
    return parsed


def _account_size(value: str) -> int:
    parsed = _positive_int(value)
    if parsed > 30:
        raise argparse.ArgumentTypeError("邮箱列表最大值为 30")
    return parsed


def _read_text(inline: str | None, filename: str | None, label: str) -> str | None:
    if inline is not None and filename is not None:
        raise CMailError(f"{label} 不能同时使用内联参数和文件参数")
    if filename is None:
        return inline
    try:
        return Path(filename).read_text(encoding="utf-8")
    except OSError as exc:
        raise CMailError(f"无法读取{label}文件 {filename}: {exc}") from exc


class CMailClient:
    """Small typed wrapper around the documented Cloud Mail endpoints."""

    def __init__(
        self,
        host: str,
        email: str,
        password: str,
        *,
        timeout: float = DEFAULT_TIMEOUT,
        user_agent: str = DEFAULT_USER_AGENT,
        allow_insecure_http: bool = False,
    ) -> None:
        self.base_url = _api_root(host, allow_insecure_http=allow_insecure_http)
        self.email = email
        self.password = password
        self.timeout = timeout
        self.user_agent = user_agent
        self._token: str | None = None
        self._token_from_cache = False

    @classmethod
    def from_env(cls, *, timeout: float = DEFAULT_TIMEOUT) -> CMailClient:
        return cls(
            _required_env("CMAIL_HOST"),
            _required_env("CMAIL_EMAIL"),
            _required_env("CMAIL_PASSWORD"),
            timeout=timeout,
            user_agent=os.environ.get("CMAIL_USER_AGENT", DEFAULT_USER_AGENT),
            allow_insecure_http=_env_flag("CMAIL_ALLOW_INSECURE_HTTP"),
        )

    def _request(
        self,
        method: str,
        endpoint: str,
        *,
        params: dict[str, Any] | None = None,
        payload: JsonObject | None = None,
        authenticated: bool = True,
    ) -> JsonObject:
        query = [
            (key, str(value))
            for key, value in (params or {}).items()
            if value is not None
        ]
        url = f"{self.base_url}{endpoint}"
        if query:
            url = f"{url}?{urlencode(query)}"

        headers = {
            "Accept": "application/json",
            "User-Agent": self.user_agent,
        }
        data = None
        if payload is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        if authenticated:
            self._ensure_token()
            assert self._token is not None
            headers["Authorization"] = self._token

        request = Request(url, data=data, headers=headers, method=method)
        try:
            with urlopen(request, timeout=self.timeout) as response:
                raw = response.read()
                status = getattr(response, "status", None)
        except HTTPError as exc:
            payload = _parse_json(exc.read(), status=exc.code)
            raise ApiError(
                f"HTTP {exc.code}: {_api_message(payload)}", status=exc.code
            ) from exc
        except URLError as exc:
            reason = getattr(exc, "reason", exc)
            raise CMailError(f"无法连接 CMail: {reason}") from exc
        except TimeoutError as exc:
            raise CMailError("请求 CMail 超时") from exc
        except OSError as exc:
            raise CMailError(f"无法连接 CMail: {exc}") from exc

        payload = _parse_json(raw, status=status)
        code = payload.get("code")
        if code is not None and code != 200:
            error_status = status
            if (error_status is None or error_status < 400) and isinstance(code, int):
                error_status = code
            raise ApiError(_api_message(payload), status=error_status)
        return payload

    def _load_cached_token(self) -> str | None:
        path = _token_cache_path()
        try:
            cached = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError):
            return None
        if not isinstance(cached, dict):
            return None
        if cached.get("baseUrl") != self.base_url or cached.get("email") != self.email:
            return None
        token = cached.get("token")
        return token if isinstance(token, str) and token else None

    def _save_cached_token(self) -> None:
        path = _token_cache_path()
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            file_descriptor, temporary_name = tempfile.mkstemp(
                prefix=f".{path.name}.", dir=path.parent
            )
            try:
                with os.fdopen(file_descriptor, "w", encoding="utf-8") as handle:
                    os.chmod(temporary_name, 0o600)
                    json.dump(
                        {
                            "baseUrl": self.base_url,
                            "email": self.email,
                            "token": self._token,
                        },
                        handle,
                    )
                    handle.write("\n")
                os.replace(temporary_name, path)
            finally:
                try:
                    os.unlink(temporary_name)
                except FileNotFoundError:
                    pass
        except OSError:
            # Caching is an optimization; a read-only home must not break API calls.
            return

    def _clear_cached_token(self) -> None:
        try:
            _token_cache_path().unlink()
        except FileNotFoundError:
            pass
        except OSError:
            return

    def _ensure_token(self) -> None:
        if self._token is not None:
            return
        cached = self._load_cached_token()
        if cached is not None:
            self._token = cached
            self._token_from_cache = True
            return
        self.login()

    def login(self) -> JsonObject:
        response = self._request(
            "POST",
            "/login",
            payload={"email": self.email, "password": self.password},
            authenticated=False,
        )
        data = response.get("data")
        if not isinstance(data, dict) or not isinstance(data.get("token"), str):
            raise ApiError("登录成功响应中没有 token")
        self._token = data["token"]
        self._token_from_cache = False
        self._save_cached_token()
        return response

    def call(
        self,
        method: str,
        endpoint: str,
        *,
        params: dict[str, Any] | None = None,
        payload: JsonObject | None = None,
    ) -> JsonObject:
        try:
            return self._request(method, endpoint, params=params, payload=payload)
        except ApiError as exc:
            if exc.status not in {401, 403} or not self._token_from_cache:
                raise
            self._clear_cached_token()
            self._token = None
            self._token_from_cache = False
            self.login()
            return self._request(method, endpoint, params=params, payload=payload)


def _require_confirmation(args: argparse.Namespace, action: str) -> None:
    if not args.yes:
        raise CMailError(f"{action}不可逆或可能丢失数据；确认后重新执行并加 --yes")


def _attachments(paths: list[str] | None) -> list[JsonObject]:
    if not paths:
        return []
    if len(paths) > MAX_ATTACHMENTS:
        raise CMailError(f"附件最多 {MAX_ATTACHMENTS} 个")

    result: list[JsonObject] = []
    for filename in paths:
        path = Path(filename)
        if not path.is_file():
            raise CMailError(f"附件不存在或不是文件: {filename}")
        try:
            content = path.read_bytes()
        except OSError as exc:
            raise CMailError(f"无法读取附件 {filename}: {exc}") from exc
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        result.append(
            {
                "filename": path.name,
                "contentType": content_type,
                "content": base64.b64encode(content).decode("ascii"),
                "size": len(content),
            }
        )
    return result


def _handle_me(client: CMailClient, _args: argparse.Namespace) -> JsonObject:
    return client.call("GET", "/my/loginUserInfo")


def _handle_account(client: CMailClient, args: argparse.Namespace) -> JsonObject:
    if args.account_action == "list":
        return client.call(
            "GET",
            "/account/list",
            params={
                "size": args.size,
                "accountId": args.account_id,
                "lastSort": args.last_sort,
            },
        )
    if args.account_action == "add":
        payload = {"email": args.email}
        if args.token is not None:
            payload["token"] = args.token
        return client.call("POST", "/account/add", payload=payload)

    _require_confirmation(args, "删除邮箱")
    return client.call(
        "DELETE", "/account/delete", params={"accountId": args.account_id}
    )


def _handle_mail(client: CMailClient, args: argparse.Namespace) -> JsonObject:
    if args.mail_action == "list":
        return client.call(
            "GET",
            "/email/list",
            params={
                "accountId": args.account_id,
                "type": args.mail_type,
                "emailId": args.email_id,
                "size": args.size,
                "timeSort": args.time_sort,
                "allReceive": args.all_receive,
                "full": args.full,
            },
        )
    if args.mail_action == "send":
        content = _read_text(args.content, args.content_file, "HTML 正文")
        assert content is not None
        text = _read_text(args.text, args.text_file, "纯文本正文")
        recipients = _split_values(args.to, "收件人")
        if args.send_type == "reply" and args.email_id is None:
            raise CMailError("回复邮件必须提供 --email-id")
        if args.email_id is not None and args.send_type is None:
            raise CMailError("提供 --email-id 时必须同时提供 --send-type")
        payload: JsonObject = {
            "accountId": args.account_id,
            "receiveEmail": recipients,
            "subject": args.subject,
            "content": content,
        }
        optional = {
            "text": text,
            "name": args.name,
            "sendType": args.send_type,
            "emailId": args.email_id,
        }
        payload.update(
            {key: value for key, value in optional.items() if value is not None}
        )
        attachments = _attachments(args.attachment)
        if attachments:
            payload["attachments"] = attachments
        return client.call("POST", "/email/send", payload=payload)

    _require_confirmation(args, "删除邮件")
    return client.call(
        "DELETE",
        "/email/delete",
        params={"emailIds": _ids(args.email_ids, "邮件 id")},
    )


def _handle_users(client: CMailClient, args: argparse.Namespace) -> JsonObject:
    if args.user_action == "list":
        return client.call(
            "GET",
            "/user/list",
            params={
                "num": args.num,
                "size": args.size,
                "email": args.email,
                "timeSort": args.time_sort,
                "status": args.status,
                "isDel": args.is_del,
            },
        )
    if args.user_action == "add":
        password = args.password
        if args.password_stdin:
            password = sys.stdin.read().rstrip("\n")
        elif password is None:
            password = getpass.getpass("新用户密码: ")
        if len(password) < 6:
            raise CMailError("用户密码至少 6 位")
        return client.call(
            "POST",
            "/user/add",
            payload={"email": args.email, "password": password},
        )
    if args.user_action == "status":
        return client.call(
            "PUT",
            "/user/setStatus",
            payload={"userId": args.user_id, "status": args.status},
        )

    _require_confirmation(args, "删除用户")
    return client.call(
        "DELETE",
        "/user/delete",
        params={"userIds": _ids(args.user_ids, "用户 id")},
    )


def _handle_all_mail(client: CMailClient, args: argparse.Namespace) -> JsonObject:
    if args.all_mail_action == "list":
        return client.call(
            "GET",
            "/allEmail/list",
            params={
                "emailId": args.email_id,
                "size": args.size,
                "timeSort": args.time_sort,
                "type": args.mail_type,
                "name": args.name,
                "subject": args.subject,
                "userEmail": args.user_email,
                "accountEmail": args.account_email,
                "full": args.full,
            },
        )

    _require_confirmation(args, "永久删除全域邮件")
    return client.call(
        "DELETE",
        "/allEmail/delete",
        params={"emailIds": _ids(args.email_ids, "邮件 id")},
    )


def _handle_regkey(client: CMailClient, args: argparse.Namespace) -> JsonObject:
    if args.regkey_action == "list":
        return client.call("GET", "/regKey/list", params={"code": args.code})
    if args.regkey_action == "add":
        return client.call(
            "POST",
            "/regKey/add",
            payload={
                "code": args.code,
                "roleId": args.role_id,
                "count": args.count,
                "expireTime": args.expire_time,
            },
        )
    if args.regkey_action == "history":
        return client.call(
            "GET", "/regKey/history", params={"regKeyId": args.regkey_id}
        )

    _require_confirmation(args, "删除注册码")
    return client.call(
        "DELETE",
        "/regKey/delete",
        params={"regKeyIds": _ids(args.regkey_ids, "注册码 id")},
    )


def _add_yes(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--yes",
        action="store_true",
        help="确认执行可能不可逆的删除操作",
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="cmail",
        description="管理 Cloud Mail 域名邮箱；认证信息从 CMAIL_HOST、CMAIL_EMAIL、CMAIL_PASSWORD 读取。",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_TIMEOUT,
        help=f"HTTP 超时时间，默认 {DEFAULT_TIMEOUT:g} 秒",
    )
    resources = parser.add_subparsers(dest="resource", required=True)

    me = resources.add_parser("me", aliases=["whoami"], help="查看当前用户和权限")
    me.set_defaults(handler=_handle_me)

    account = resources.add_parser(
        "account", aliases=["accounts"], help="管理当前用户的邮箱地址"
    )
    account_actions = account.add_subparsers(dest="account_action", required=True)
    account_list = account_actions.add_parser("list", help="列出邮箱地址")
    account_list.add_argument("--size", type=_account_size, default=30)
    account_list.add_argument("--account-id", type=_positive_int)
    account_list.add_argument("--last-sort", type=int)
    account_list.set_defaults(handler=_handle_account)
    account_add = account_actions.add_parser("add", help="添加邮箱地址")
    account_add.add_argument("--email", required=True)
    account_add.add_argument("--token", help="可选的人机验证 token")
    account_add.set_defaults(handler=_handle_account)
    account_delete = account_actions.add_parser("delete", help="删除邮箱地址")
    account_delete.add_argument("--account-id", type=_positive_int, required=True)
    _add_yes(account_delete)
    account_delete.set_defaults(handler=_handle_account)

    mail = resources.add_parser("mail", help="管理当前用户的邮件")
    mail_actions = mail.add_subparsers(dest="mail_action", required=True)
    mail_list = mail_actions.add_parser("list", help="列出收件或发件邮件")
    mail_list.add_argument("--account-id", type=_positive_int, required=True)
    mail_list.add_argument(
        "--type", dest="mail_type", type=int, choices=[0, 1], default=0
    )
    mail_list.add_argument("--email-id", type=_positive_int)
    mail_list.add_argument("--size", type=_size, default=10)
    mail_list.add_argument("--time-sort", type=int, choices=[0, 1])
    mail_list.add_argument("--all-receive", type=int, choices=[0, 1])
    mail_list.add_argument("--full", type=int, choices=[0, 1], default=0)
    mail_list.set_defaults(handler=_handle_mail)

    mail_send = mail_actions.add_parser("send", help="发送邮件")
    mail_send.add_argument("--account-id", type=_positive_int, required=True)
    mail_send.add_argument(
        "--to", action="append", required=True, help="收件人，可重复或逗号分隔"
    )
    mail_send.add_argument("--subject", required=True)
    content_group = mail_send.add_mutually_exclusive_group(required=True)
    content_group.add_argument("--content", help="HTML 正文")
    content_group.add_argument("--content-file", help="从 UTF-8 文件读取 HTML 正文")
    text_group = mail_send.add_mutually_exclusive_group()
    text_group.add_argument("--text", help="纯文本正文")
    text_group.add_argument("--text-file", help="从 UTF-8 文件读取纯文本正文")
    mail_send.add_argument("--name")
    mail_send.add_argument("--send-type", choices=["reply", "forward"])
    mail_send.add_argument(
        "--email-id", type=_positive_int, help="回复或转发的原邮件 id"
    )
    mail_send.add_argument("--attachment", action="append", help="附件路径，最多 10 个")
    mail_send.set_defaults(handler=_handle_mail)

    mail_delete = mail_actions.add_parser("delete", help="删除当前用户的邮件")
    mail_delete.add_argument(
        "--email-ids", action="append", required=True, help="邮件 id，可逗号分隔"
    )
    _add_yes(mail_delete)
    mail_delete.set_defaults(handler=_handle_mail)

    users = resources.add_parser("users", help="管理员管理用户")
    user_actions = users.add_subparsers(dest="user_action", required=True)
    user_list = user_actions.add_parser("list", help="列出用户")
    user_list.add_argument("--num", type=_positive_int, default=1)
    user_list.add_argument("--size", type=_size, default=50)
    user_list.add_argument("--email")
    user_list.add_argument("--time-sort", type=int, choices=[0, 1])
    user_list.add_argument("--status", type=int, choices=[0, 1])
    user_list.add_argument("--is-del", type=int, choices=[0, 1])
    user_list.set_defaults(handler=_handle_users)
    user_add = user_actions.add_parser("add", help="添加用户")
    user_add.add_argument("--email", required=True)
    password_group = user_add.add_mutually_exclusive_group()
    password_group.add_argument(
        "--password", help="新用户密码；更安全的方式是 --password-stdin"
    )
    password_group.add_argument(
        "--password-stdin", action="store_true", help="从 stdin 读取新用户密码"
    )
    user_add.set_defaults(handler=_handle_users)
    user_status = user_actions.add_parser("status", help="启用或禁用用户")
    user_status.add_argument("--user-id", type=_positive_int, required=True)
    user_status.add_argument("--status", type=int, choices=[0, 1], required=True)
    user_status.set_defaults(handler=_handle_users)
    user_delete = user_actions.add_parser("delete", help="永久删除用户及其邮件")
    user_delete.add_argument(
        "--user-ids", action="append", required=True, help="用户 id，可逗号分隔"
    )
    _add_yes(user_delete)
    user_delete.set_defaults(handler=_handle_users)

    all_mail = resources.add_parser("all-mail", help="管理员管理全域邮件")
    all_mail_actions = all_mail.add_subparsers(dest="all_mail_action", required=True)
    all_mail_list = all_mail_actions.add_parser("list", help="查询全部用户的邮件")
    all_mail_list.add_argument("--email-id", type=_positive_int)
    all_mail_list.add_argument("--size", type=_size, default=10)
    all_mail_list.add_argument("--time-sort", type=int, choices=[0, 1])
    all_mail_list.add_argument(
        "--type",
        dest="mail_type",
        choices=["all", "receive", "send", "delete", "noone"],
        default="receive",
    )
    all_mail_list.add_argument("--name")
    all_mail_list.add_argument("--subject")
    all_mail_list.add_argument("--user-email")
    all_mail_list.add_argument("--account-email")
    all_mail_list.add_argument("--full", type=int, choices=[0, 1], default=0)
    all_mail_list.set_defaults(handler=_handle_all_mail)
    all_mail_delete = all_mail_actions.add_parser("delete", help="永久删除全域邮件")
    all_mail_delete.add_argument(
        "--email-ids", action="append", required=True, help="邮件 id，可逗号分隔"
    )
    _add_yes(all_mail_delete)
    all_mail_delete.set_defaults(handler=_handle_all_mail)

    regkey = resources.add_parser("regkey", aliases=["regkeys"], help="管理注册码")
    regkey_actions = regkey.add_subparsers(dest="regkey_action", required=True)
    regkey_list = regkey_actions.add_parser("list", help="列出注册码")
    regkey_list.add_argument("--code")
    regkey_list.set_defaults(handler=_handle_regkey)
    regkey_add = regkey_actions.add_parser("add", help="创建注册码")
    regkey_add.add_argument("--code", required=True)
    regkey_add.add_argument("--role-id", type=_positive_int, required=True)
    regkey_add.add_argument("--count", type=_positive_int, required=True)
    regkey_add.add_argument("--expire-time", required=True, help="例如 2099-12-30")
    regkey_add.set_defaults(handler=_handle_regkey)
    regkey_history = regkey_actions.add_parser("history", help="查询注册码使用记录")
    regkey_history.add_argument("--regkey-id", type=_positive_int, required=True)
    regkey_history.set_defaults(handler=_handle_regkey)
    regkey_delete = regkey_actions.add_parser("delete", help="删除注册码")
    regkey_delete.add_argument(
        "--regkey-ids", action="append", required=True, help="注册码 id，可逗号分隔"
    )
    _add_yes(regkey_delete)
    regkey_delete.set_defaults(handler=_handle_regkey)

    return parser


def execute(args: argparse.Namespace) -> JsonObject:
    client = CMailClient.from_env(timeout=args.timeout)
    return args.handler(client, args)


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.timeout <= 0:
        parser.error("--timeout 必须大于 0")
    try:
        result = execute(args)
    except CMailError as exc:
        print(f"cmail: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
