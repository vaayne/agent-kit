#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["httpx", "rich"]
# ///
"""
OpenList Client SDK — reusable client for OpenList/AList servers.

Import in custom scripts:
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).parent))
    from openlist_client import OpenListClient

Env vars:
  OPENLIST_URL       Base URL, e.g. http://localhost:5244
  OPENLIST_TOKEN     Pre-issued JWT token  (takes priority)
  OPENLIST_USERNAME  } fallback: login with
  OPENLIST_PASSWORD  }          username + password
"""

import logging
import os
from pathlib import Path
from urllib.parse import quote

import httpx

logger = logging.getLogger(__name__)


class OpenListClient:
    def __init__(self, base_url: str, token: str):
        self.base_url = base_url.rstrip("/")
        self._client = httpx.Client(
            base_url=self.base_url,
            headers={"Authorization": token},
            timeout=60,
        )

    @classmethod
    def from_env(cls) -> "OpenListClient":
        base_url = os.environ["OPENLIST_URL"]
        token = os.environ.get("OPENLIST_TOKEN")
        if not token:
            token = cls._login(
                base_url,
                os.environ["OPENLIST_USERNAME"],
                os.environ["OPENLIST_PASSWORD"],
            )
        return cls(base_url, token)

    @staticmethod
    def _login(base_url: str, username: str, password: str) -> str:
        resp = httpx.post(
            f"{base_url}/api/auth/login",
            json={"username": username, "password": password},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        if data["code"] != 200:
            raise RuntimeError(f"Login failed: {data['message']}")
        logger.info("Logged in as %s", username)
        return data["data"]["token"]

    def _post(self, path: str, **kwargs) -> dict:
        resp = self._client.post(path, **kwargs)
        resp.raise_for_status()
        data = resp.json()
        if data["code"] != 200:
            raise RuntimeError(f"API error {data['code']}: {data['message']}")
        return data["data"] or {}

    # --- read operations ---

    def list(
        self,
        path: str,
        page: int = 1,
        per_page: int = 500,
        password: str = "",
        refresh: bool = False,
    ) -> dict:
        return self._post(
            "/api/fs/list",
            json={
                "path": path,
                "password": password,
                "page": page,
                "per_page": per_page,
                "refresh": refresh,
            },
        )

    def list_all(self, path: str, password: str = "") -> list[dict]:
        items, page = [], 1
        while True:
            data = self.list(path, page=page, per_page=500, password=password)
            items.extend(data.get("content") or [])
            if not data.get("has_more"):
                break
            page += 1
        return items

    def get(self, path: str, password: str = "", refresh: bool = False) -> dict:
        return self._post(
            "/api/fs/get",
            json={
                "path": path,
                "password": password,
                "refresh": refresh,
            },
        )

    def search(
        self,
        parent: str,
        keywords: str,
        scope: int = 0,
        page: int = 1,
        per_page: int = 100,
        password: str = "",
    ) -> dict:
        return self._post(
            "/api/fs/search",
            json={
                "parent": parent,
                "keywords": keywords,
                "scope": scope,
                "page": page,
                "per_page": per_page,
                "password": password,
            },
        )

    def dirs(
        self, path: str, password: str = "", force_root: bool = False
    ) -> list[dict]:
        return self._post(
            "/api/fs/dirs",
            json={
                "path": path,
                "password": password,
                "force_root": force_root,
            },
        )

    # --- write operations ---

    def mkdir(self, path: str) -> None:
        self._post("/api/fs/mkdir", json={"path": path})

    def rename(self, path: str, new_name: str) -> None:
        self._post("/api/fs/rename", json={"path": path, "name": new_name})

    def batch_rename(self, src_dir: str, renames: list[dict]) -> None:
        """renames: [{"src_name": "old.txt", "new_name": "new.txt"}, ...]"""
        self._post(
            "/api/fs/batch_rename",
            json={
                "src_dir": src_dir,
                "rename_objects": renames,
            },
        )

    def regex_rename(self, src_dir: str, src_regex: str, new_regex: str) -> None:
        self._post(
            "/api/fs/regex_rename",
            json={
                "src_dir": src_dir,
                "src_name_regex": src_regex,
                "new_name_regex": new_regex,
            },
        )

    def move(self, src_dir: str, dst_dir: str, names: list[str]) -> None:
        self._post(
            "/api/fs/move",
            json={
                "src_dir": src_dir,
                "dst_dir": dst_dir,
                "names": names,
            },
        )

    def recursive_move(self, src_dir: str, dst_dir: str) -> None:
        self._post(
            "/api/fs/recursive_move",
            json={
                "src_dir": src_dir,
                "dst_dir": dst_dir,
            },
        )

    def copy(self, src_dir: str, dst_dir: str, names: list[str]) -> None:
        self._post(
            "/api/fs/copy",
            json={
                "src_dir": src_dir,
                "dst_dir": dst_dir,
                "names": names,
            },
        )

    def remove(self, directory: str, names: list[str]) -> None:
        self._post("/api/fs/remove", json={"dir": directory, "names": names})

    def remove_empty_dirs(self, src_dir: str) -> None:
        self._post("/api/fs/remove_empty_directory", json={"src_dir": src_dir})

    def upload(self, local_path: Path, remote_path: str, as_task: bool = False) -> dict:
        data = local_path.read_bytes()
        resp = self._client.put(
            "/api/fs/put",
            content=data,
            headers={
                "File-Path": quote(remote_path),
                "Content-Length": str(len(data)),
                "As-Task": str(as_task).lower(),
                "Content-Type": "application/octet-stream",
            },
        )
        resp.raise_for_status()
        result = resp.json()
        if result["code"] != 200:
            raise RuntimeError(f"Upload failed: {result['message']}")
        return result["data"] or {}

    def offline_download(
        self,
        path: str,
        urls: list[str],
        tool: str = "SimpleHttp",
        delete_policy: str = "delete_on_upload_succeed",
    ) -> dict:
        return self._post(
            "/api/fs/add_offline_download",
            json={
                "path": path,
                "urls": urls,
                "tool": tool,
                "delete_policy": delete_policy,
            },
        )

    def me(self) -> dict:
        resp = self._client.get("/api/me")
        resp.raise_for_status()
        data = resp.json()
        if data["code"] != 200:
            raise RuntimeError(f"API error: {data['message']}")
        return data["data"]


def size_fmt(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024:
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} PB"
