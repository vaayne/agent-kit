# OpenList Use Cases

Quick reference for common tasks using `scripts/openlist.py`.
Copy both `scripts/openlist.py` and `scripts/openlist_client.py` to `.agents/scripts/` first, then `source ~/.zshenv`.

```bash
SCRIPT="uv run --script .agents/scripts/openlist.py"
```

---

## 浏览 / 查找

```bash
# 列出目录
$SCRIPT ls "/quark/来自：分享/TVs"

# 查看文件/目录元数据
$SCRIPT get "/quark/来自：分享/TVs/Arcane"

# 搜索（需服务端已建索引）
$SCRIPT search "2160p" --parent "/quark" --scope files

# 只显示子目录树
$SCRIPT tree "/quark/来自：分享"
```

## 文件操作

```bash
# 新建目录
$SCRIPT mkdir "/quark/来自：分享/TVs/新剧名 (2025)"

# 重命名单个文件或目录
$SCRIPT rename "/quark/来自：分享/TVs/旧名" "新名"

# 移动文件（多个文件名用空格分隔）
$SCRIPT mv "/quark/downloads" "/quark/来自：分享/TVs" "file1.mkv" "file2.mkv"

# 递归移动整个目录
$SCRIPT mvr "/quark/downloads/剧名" "/quark/来自：分享/TVs/剧名"

# 复制文件
$SCRIPT cp "/quark/source" "/quark/dest" "file.mkv"

# 删除（会有确认提示，加 --yes 跳过）
$SCRIPT rm "/quark/来自：分享/TVs/某目录" "file1.mkv" "file2.mkv"
$SCRIPT rm "/quark/来自：分享/TVs/某目录" "file.mkv" --yes

# 清理空目录
$SCRIPT rmempty "/quark/downloads"
```

## Emby / Jellyfin 媒体库整理

Emby 命名规范：

- 剧集目录：`Show Name (Year)` — **英文原名 + 首播年**，否则无法匹配 TMDB 元数据
- 季目录：`Season 1`、`Season 2`（不能用 `S01`）
- 文件名：`Show Name - S01E01.mkv` 或 `Show Name - S01E01.2160p.WEB-DL.mkv`

整理一个剧集的标准步骤：

```bash
# 1. 先列出当前结构确认路径
$SCRIPT ls "/quark/来自：分享/TVs/夜魔侠：重生"
$SCRIPT ls "/quark/来自：分享/TVs/夜魔侠：重生/S02"

# 2. 用 regex-rename 批量重命名集数文件（在季目录内操作）
#    示例：S02E01.2026.2160p.WEB-DL.H265.mkv → Daredevil Born Again - S02E01.2160p.WEB-DL.mkv
$SCRIPT regex-rename \
  "/quark/来自：分享/TVs/夜魔侠：重生/S02" \
  "^(S\d{2}E\d{2})\.\d{4}\.(2160p\.WEB-DL).*?(\.mkv)$" \
  "Daredevil Born Again - \1.\2\3"

# 3. 重命名季目录
$SCRIPT rename "/quark/来自：分享/TVs/夜魔侠：重生/S02" "Season 2"

# 4. 重命名剧集目录（搜索 TMDB 确认英文名和年份）
$SCRIPT rename "/quark/来自：分享/TVs/夜魔侠：重生" "Daredevil Born Again (2025)"
```

> **注意**：`regex-rename` 的正则语法为 Python re，`\1 \2` 为反向引用。执行前先用 `ls` 确认文件名格式。对于复杂批量操作（跨多季、多剧集），写专项脚本比逐条 CLI 更可靠——参考 `client-template.md`。

## 离线下载

```bash
# HTTP 直链
$SCRIPT dl "/quark/downloads" "https://example.com/file.mkv"

# 多个链接
$SCRIPT dl "/quark/downloads" "https://..." "https://..." --tool aria2
```
