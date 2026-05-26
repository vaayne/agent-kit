# OpenList / AList API Reference

Base URL: `$OPENLIST_URL` (e.g. `http://localhost:5244`)\
Auth header: `Authorization: <token>`\
All request bodies are JSON unless noted.\
All responses: `{"code": 200, "message": "success", "data": ...}`

---

## Authentication

### POST /api/auth/login

Get a JWT token (valid 48h by default).

```json
// request
{"username": "admin", "password": "password"}
// response data
{"token": "xxx", "device_key": "yyy"}
```

### GET /api/auth/logout

Invalidate current token. Header: `Authorization`.

### GET /api/me

Get current user info. Header: `Authorization`.

---

## File System

### POST /api/fs/list — List directory

```json
// request
{"path": "/", "password": "", "page": 1, "per_page": 100, "refresh": false}
// response data
{
  "content": [{"name": "...", "size": 0, "is_dir": true, "modified": "...", "type": 1}],
  "total": 10, "filtered_total": 10, "page": 1, "per_page": 100,
  "has_more": false, "pages_total": 1, "write": true, "provider": "Local"
}
```

- `per_page` max 500; `page <= 0` normalized to 1
- `type`: 1=folder, 2=video, 3=audio, 4=text, 5=image, 0=unknown

### POST /api/fs/get — Get file/dir metadata

```json
// request
{"path": "/file.txt", "password": "", "refresh": false}
// response data
{"name": "file.txt", "size": 1234, "is_dir": false, "modified": "...",
 "raw_url": "http://...", "provider": "Local"}
```

### POST /api/fs/search — Search files

```json
// request
{"parent": "/", "keywords": "query", "scope": 0, "page": 1, "per_page": 100, "password": ""}
// scope: 0=all, 1=folders only, 2=files only
// response data
{"content": [{"parent": "/path", "name": "file.txt", "is_dir": false, "size": 100, "type": 0}], "total": 1}
```

### POST /api/fs/dirs — Directory tree (folders only)

```json
// request
{ "path": "/", "password": "", "force_root": false }
// response data: [{"name": "subdir", "modified": "..."}]
```

### POST /api/fs/mkdir — Create directory

```json
{ "path": "/new/dir" }
```

### POST /api/fs/rename — Rename file or directory

```json
{ "path": "/old/name.txt", "name": "newname.txt" }
```

- `name` must not contain `/`
- Returns 403 if path is under a password-protected meta path (>= v3.58.0)

### POST /api/fs/batch_rename — Batch rename

```json
{
  "src_dir": "/mydir",
  "rename_objects": [{ "src_name": "old.txt", "new_name": "new.txt" }]
}
```

### POST /api/fs/regex_rename — Regex rename

```json
{
  "src_dir": "/mydir",
  "src_name_regex": "^test(.*)\\.txt$",
  "new_name_regex": "renamed$1.txt"
}
```

### POST /api/fs/move — Move files

```json
{
  "src_dir": "/source",
  "dst_dir": "/destination",
  "names": ["file1.txt", "file2.txt"]
}
```

### POST /api/fs/recursive_move — Recursive move

```json
{ "src_dir": "/source", "dst_dir": "/destination" }
```

### POST /api/fs/copy — Copy files

```json
{ "src_dir": "/source", "dst_dir": "/destination", "names": ["file.txt"] }
```

### POST /api/fs/remove — Delete files/dirs

```json
{ "dir": "/parent", "names": ["file.txt", "subdir"] }
```

### POST /api/fs/remove_empty_directory — Remove empty directories

```json
{ "src_dir": "/path/to/clean" }
```

### PUT /api/fs/put — Upload file (stream)

Headers: `Authorization`, `File-Path: <URL-encoded path>`, `Content-Length: <bytes>`, `As-Task: true/false`\
Body: raw file bytes

### POST /api/fs/form — Upload file (multipart)

Headers: `Authorization`, `File-Path: <URL-encoded path>`, `Content-Length: <bytes>`\
Body: multipart/form-data with `file` field

### POST /api/fs/add_offline_download — Offline download

```json
{
  "path": "/destination",
  "urls": ["https://example.com/file.zip"],
  "tool": "SimpleHttp",
  "delete_policy": "delete_on_upload_succeed"
}
// tool: "aria2" | "SimpleHttp" | "qBittorrent"
// delete_policy: "delete_on_upload_succeed" | "delete_on_upload_failed" | "delete_never" | "delete_always"
```
