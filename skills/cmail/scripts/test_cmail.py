from __future__ import annotations

import base64
import json
import os
import stat
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

import cmail


class _FakeMailHandler(BaseHTTPRequestHandler):
    server: _FakeMailServer

    def log_message(self, _format: str, *_args: object) -> None:
        return

    def _record(self, body: bytes = b"") -> None:
        self.server.requests.append(
            {
                "method": self.command,
                "path": urlsplit(self.path).path,
                "query": parse_qs(urlsplit(self.path).query),
                "headers": dict(self.headers),
                "body": body,
            }
        )

    def _respond(self, payload: dict[str, object], status: int = 200) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _respond_raw(self, raw: bytes, status: int, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _reject_cached_token(self) -> bool:
        if (
            self.server.reject_cached_token
            and self.headers.get("Authorization") == "test-token"
        ):
            if self.server.html_reject_cached_token:
                self._respond_raw(b"<html>blocked</html>", 403, "text/html")
                return True
            self._respond(
                {"code": 403, "message": "forbidden", "data": None}, status=403
            )
            return True
        return False

    def do_GET(self) -> None:
        self._record()
        if self._reject_cached_token():
            return
        self._respond({"code": 200, "message": "success", "data": []})

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        self._record(body)
        if urlsplit(self.path).path == "/api/login":
            token_index = min(
                self.server.login_calls, len(self.server.login_tokens) - 1
            )
            token = self.server.login_tokens[token_index]
            self.server.login_calls += 1
            self._respond({"code": 200, "message": "success", "data": {"token": token}})
        else:
            if self._reject_cached_token():
                return
            self._respond({"code": 200, "message": "success", "data": []})

    def do_DELETE(self) -> None:
        self._record()
        if self._reject_cached_token():
            return
        self._respond({"code": 200, "message": "success", "data": None})


class _FakeMailServer(ThreadingHTTPServer):
    def __init__(self) -> None:
        super().__init__(("127.0.0.1", 0), _FakeMailHandler)
        self.requests: list[dict[str, object]] = []
        self.login_tokens = ["test-token"]
        self.login_calls = 0
        self.reject_cached_token = False
        self.html_reject_cached_token = False


class CMailClientTests(unittest.TestCase):
    def setUp(self) -> None:
        self.server = _FakeMailServer()
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.cache_dir = tempfile.TemporaryDirectory()
        self.env = {
            "CMAIL_HOST": f"http://127.0.0.1:{self.server.server_port}",
            "CMAIL_EMAIL": "admin@example.com",
            "CMAIL_PASSWORD": "secret",
            "CMAIL_TOKEN_CACHE": str(Path(self.cache_dir.name) / "token.json"),
        }

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.cache_dir.cleanup()

    def test_auth_header_is_raw_token_and_host_normalization(self) -> None:
        self.env["CMAIL_PASSWORD"] = " secret "
        base_host = self.env["CMAIL_HOST"]
        self.assertEqual(cmail._api_root(base_host), f"{base_host}/api")
        self.assertEqual(cmail._api_root(f"{base_host}/api/"), f"{base_host}/api")
        with patch.dict(os.environ, self.env, clear=False):
            result = cmail.execute(
                cmail.build_parser().parse_args(["account", "list", "--size", "1"])
            )

        self.assertEqual(result["code"], 200)
        self.assertEqual(len(self.server.requests), 2)
        login, account = self.server.requests
        self.assertEqual(login["path"], "/api/login")
        self.assertEqual(json.loads(login["body"])["password"], " secret ")
        cache_path = Path(self.env["CMAIL_TOKEN_CACHE"])
        self.assertEqual(stat.S_IMODE(cache_path.stat().st_mode), 0o600)
        self.assertEqual(login["headers"]["User-Agent"], "curl/8.0.0")
        self.assertEqual(account["path"], "/api/account/list")
        self.assertEqual(account["headers"]["Authorization"], "test-token")
        self.assertNotIn("Bearer ", account["headers"]["Authorization"])
        self.assertEqual(account["query"], {"size": ["1"]})

    def test_cached_token_skips_login_on_the_next_invocation(self) -> None:
        with patch.dict(os.environ, self.env, clear=False):
            cmail.execute(
                cmail.build_parser().parse_args(["account", "list", "--size", "1"])
            )
            self.server.requests.clear()
            cmail.execute(
                cmail.build_parser().parse_args(["account", "list", "--size", "1"])
            )

        self.assertEqual(
            [request["path"] for request in self.server.requests], ["/api/account/list"]
        )
        self.assertEqual(self.server.login_calls, 1)

    def test_cached_unauthorized_token_is_refreshed_once(self) -> None:
        self.server.login_tokens = ["test-token", "fresh-token"]
        with patch.dict(os.environ, self.env, clear=False):
            cmail.execute(
                cmail.build_parser().parse_args(["account", "list", "--size", "1"])
            )
            self.server.requests.clear()
            self.server.reject_cached_token = True
            cmail.execute(
                cmail.build_parser().parse_args(["account", "list", "--size", "1"])
            )

        self.assertEqual(
            [request["path"] for request in self.server.requests],
            ["/api/account/list", "/api/login", "/api/account/list"],
        )
        self.assertEqual(
            self.server.requests[-1]["headers"]["Authorization"], "fresh-token"
        )

    def test_html_unauthorized_token_is_refreshed_once(self) -> None:
        self.server.login_tokens = ["test-token", "fresh-token"]
        with patch.dict(os.environ, self.env, clear=False):
            cmail.execute(
                cmail.build_parser().parse_args(["account", "list", "--size", "1"])
            )
            self.server.requests.clear()
            self.server.reject_cached_token = True
            self.server.html_reject_cached_token = True
            cmail.execute(
                cmail.build_parser().parse_args(["account", "list", "--size", "1"])
            )

        self.assertEqual(
            [request["path"] for request in self.server.requests],
            ["/api/account/list", "/api/login", "/api/account/list"],
        )
        self.assertEqual(
            self.server.requests[-1]["headers"]["Authorization"], "fresh-token"
        )

    def test_remote_http_requires_explicit_opt_in(self) -> None:
        with self.assertRaises(cmail.CMailError):
            cmail.CMailClient("http://mail.example.com", "a@example.com", "secret")

        with patch.dict(
            os.environ,
            {
                **self.env,
                "CMAIL_HOST": "http://mail.example.com",
                "CMAIL_ALLOW_INSECURE_HTTP": "1",
            },
            clear=False,
        ):
            client = cmail.CMailClient.from_env()
        self.assertEqual(client.base_url, "http://mail.example.com/api")

    def test_mail_lists_default_to_summary_only(self) -> None:
        parser = cmail.build_parser()
        mail_args = parser.parse_args(["mail", "list", "--account-id", "1"])
        all_mail_args = parser.parse_args(["all-mail", "list"])
        self.assertEqual(mail_args.full, 0)
        self.assertEqual(all_mail_args.full, 0)

    def test_send_file_and_attachment_are_encoded_in_documented_payload(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            body_path = Path(directory) / "body.html"
            attachment_path = Path(directory) / "note.txt"
            body_path.write_text("<p>Hello</p>", encoding="utf-8")
            attachment_path.write_text("hello", encoding="utf-8")
            argv = [
                "mail",
                "send",
                "--account-id",
                "1",
                "--to",
                "alice@example.com,bob@example.com",
                "--subject",
                "Hello",
                "--content-file",
                str(body_path),
                "--attachment",
                str(attachment_path),
            ]
            with patch.dict(os.environ, self.env, clear=False):
                cmail.execute(cmail.build_parser().parse_args(argv))

        request = self.server.requests[-1]
        payload = json.loads(request["body"])
        self.assertEqual(
            payload["receiveEmail"], ["alice@example.com", "bob@example.com"]
        )
        self.assertEqual(payload["content"], "<p>Hello</p>")
        self.assertEqual(
            payload["attachments"][0]["content"],
            base64.b64encode(b"hello").decode(),
        )
        self.assertEqual(payload["attachments"][0]["filename"], "note.txt")

    def test_delete_requires_explicit_yes_before_network_call(self) -> None:
        args = cmail.build_parser().parse_args(["mail", "delete", "--email-ids", "1,2"])
        with (
            patch.dict(os.environ, self.env, clear=False),
            self.assertRaises(cmail.CMailError),
        ):
            cmail.execute(args)
        self.assertEqual(self.server.requests, [])


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parent))
    unittest.main()
