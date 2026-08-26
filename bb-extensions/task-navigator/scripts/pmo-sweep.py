#!/usr/bin/env python3
"""PMO sweep: read the Task Navigator overview and print a digest; --apply performs the deterministic rules.

Rules (deterministic, safe to repeat):
  1. Every PR merged, no live thread, status not done  -> mark done + comment.
  2. Next older than NEXT_MAX_DAYS                     -> listed as 过期 for the PMO agent to rewrite.
  3. Stalled tasks                                     -> listed with their primary thread for the agent to read and write Next.
Nothing is ever canceled or deleted here; those stay human decisions.
"""
import argparse, json, os, subprocess, sys, time, urllib.request

BB = os.environ.get("BB_CLI") or "bb"
RPC = os.environ.get("TASK_NAVIGATOR_RPC", "http://127.0.0.1:38886/api/v1/plugins/task-navigator/rpc")
NEXT_MAX_DAYS = 3
STALE_DAYS = 30
DAY_MS = 86_400_000


def rpc(method, payload=None):
    req = urllib.request.Request(f"{RPC}/{method}", data=json.dumps(payload or {}).encode(), headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = json.load(resp)
    if not body.get("ok"):
        raise SystemExit(f"rpc {method} failed: {body}")
    return body["result"]


def bb(*args):
    r = subprocess.run([BB, *args], capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        raise SystemExit(f"bb {' '.join(args[:3])} failed: {r.stderr.strip()[:300]}")
    return r.stdout


def age_days(ts, now):
    return None if ts is None else (now - ts) / DAY_MS


def primary(task):
    threads = task["threads"]
    asking = [t for t in threads if t["status"] in ("pendingInteraction", "error") and not t["archived"]]
    if asking:
        return asking[0]
    return max(threads, key=lambda t: t["updatedAt"]) if threads else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="perform rule 1 (mark merged-and-idle tasks done)")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    now = time.time() * 1000
    ov = rpc("overview")
    groups = ov["groups"]
    active = groups["you"] + groups["running"] + groups["waiting"] + groups["stalled"] + groups["backlog"]

    merged_done, next_expired, stalled, old_stalled = [], [], [], []
    for t in active:
        prs = t["pullRequests"]
        live = [x for x in t["threads"] if not x["archived"] and x["status"] == "running"]
        if prs and all(p["state"] == "merged" for p in prs) and not live and t["status"] != "done":
            merged_done.append(t)
        nd = age_days(t.get("nextAt"), now)
        if t.get("next") and nd is not None and nd > NEXT_MAX_DAYS:
            next_expired.append((t, nd))
        if t["group"] == "stalled":
            md = age_days(t["lastMovedAt"], now)
            (old_stalled if md is not None and md > STALE_DAYS else stalled).append((t, md))

    applied = []
    if args.apply:
        for t in merged_done:
            numbers = ", ".join(f"#{p['number']}" for p in t["pullRequests"])
            bb("tasks", "update", t["key"], "--status", "done")
            bb("tasks", "comment", t["key"], "--author", "PMO", "--body", f"PMO：PR {numbers} 已合并且没有线程在跑，标记为 done。")
            applied.append(t["key"])

    if args.json:
        print(json.dumps({
            "counts": {k: len(v) for k, v in groups.items()},
            "mergedDone": [t["key"] for t in merged_done], "applied": applied,
            "nextExpired": [{"key": t["key"], "next": t["next"], "days": round(d, 1)} for t, d in next_expired],
            "stalled": [{"key": t["key"], "title": t["title"], "thread": (primary(t) or {}).get("id"), "days": None if d is None else round(d, 1)} for t, d in stalled],
            "oldStalled": [{"key": t["key"], "title": t["title"], "days": round(d, 1)} for t, d in old_stalled],
        }, ensure_ascii=False, indent=1))
        return

    c = {k: len(v) for k, v in groups.items()}
    print(f"# PMO 巡检 {time.strftime('%Y-%m-%d %H:%M')}")
    print(f"等你 {c['you']} · 在跑 {c['running']} · 等 CI/别人 {c['waiting']} · 停了 {c['stalled']} · 未开始 {c['backlog']} · 本周完成 {ov['doneThisWeek']}")
    if ov.get("pmo") is None:
        print("(提示：plugin 设置 pmoThreadId 为空，侧栏不会显示 PMO 行)")
    print()
    print(f"## PR 已合并 → done ({len(merged_done)})" + ("  [已执行]" if args.apply else "  [未执行，加 --apply]"))
    for t in merged_done:
        print(f"- {t['key']} {t['title']}")
    print(f"\n## Next 超过 {NEXT_MAX_DAYS} 天没动 ({len(next_expired)})")
    for t, d in next_expired:
        print(f"- {t['key']} {t['title']} · {d:.0f} 天 · Next: {t['next']}")
    print(f"\n## 停了，需要写 Next ({len(stalled)})")
    for t, d in stalled:
        p = primary(t)
        print(f"- {t['key']} {t['title']} · {'' if d is None else f'{d:.0f} 天没动'} · thread {p['id'] if p else '无'} · {t['status']}")
    print(f"\n## 停了超过 {STALE_DAYS} 天，建议 V 决定关掉 ({len(old_stalled)})")
    for t, d in old_stalled:
        print(f"- {t['key']} {t['title']} · {d:.0f} 天")
    print(f"\n## 等你 ({c['you']})")
    for t in groups["you"]:
        print(f"- {t['key']} {t['title']} · {t['reason']}")


if __name__ == "__main__":
    main()
