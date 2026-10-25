#!/usr/bin/env python3
"""Reduce ads and interruptions on an Android device through adb and UI automation.

The device UI is driven by text and resource IDs from `uiautomator dump --windows`,
never by fixed coordinates, so one profile works across screen sizes.

Subcommands:
  info                         device facts and package inventory (JSON)
  dump | tap | seek | scan     interactive UI helpers
  run PROFILE_DIR [--only ID] [--check] [--dry-run]
                               apply (or only check) declarative app configs
  notif-snapshot FILE          save notification channel importance per app
  notif-diff BEFORE AFTER      show channel changes between two snapshots
  channels PROFILE_DIR [--check]
                               turn off promotional channels from notifications.json
  preinstalls PROFILE_DIR      list preinstall groups with install/disable state
  disable PROFILE_DIR GROUP... disable groups and write a restore script
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

SERIAL: list[str] = []


def adb(*args: str, binary: bool = False) -> str | bytes:
    # adb shell exit codes are unreliable across Android versions; callers check output.
    proc = subprocess.run(
        ["adb", *SERIAL, *args], capture_output=True, text=not binary, check=False
    )
    return proc.stdout


def sh(*args: str) -> str:
    return adb("shell", *args)  # type: ignore[return-value]


def prop(name: str) -> str:
    return sh("getprop", name).strip()


@dataclass
class Node:
    text: str
    desc: str
    rid: str
    pkg: str
    checkable: bool
    checked: bool
    enabled: bool
    clickable: bool
    x: int
    y: int
    box: tuple[int, int, int, int]

    @property
    def label(self) -> str:
        return self.text or self.desc

    @property
    def id(self) -> str:
        return self.rid.split("/")[-1]


def dump() -> list[Node]:
    # --windows includes every window: split-pane Settings on tablets puts the
    # left list in a separate window that a plain dump omits.
    for _ in range(3):
        sh("uiautomator", "dump", "--windows", "/sdcard/ui.xml")
        raw = adb("exec-out", "cat", "/sdcard/ui.xml")
        if isinstance(raw, str) and raw.lstrip().startswith("<?xml"):
            break
        time.sleep(1)
    else:
        raise SystemExit("uiautomator dump failed")
    out = []
    for n in ET.fromstring(raw).iter("node"):
        a = list(map(int, re.findall(r"\d+", n.get("bounds", "[0,0][0,0]"))))
        out.append(
            Node(
                text=n.get("text", ""),
                desc=n.get("content-desc", ""),
                rid=n.get("resource-id", ""),
                pkg=n.get("package", ""),
                checkable=n.get("checkable") == "true",
                checked=n.get("checked") == "true",
                enabled=n.get("enabled") != "false",
                clickable=n.get("clickable") == "true",
                x=(a[0] + a[2]) // 2,
                y=(a[1] + a[3]) // 2,
                box=(a[0], a[1], a[2], a[3]),
            )
        )
    return out


def screen() -> tuple[int, int]:
    m = re.search(r"(\d+)x(\d+)", sh("wm", "size").splitlines()[-1])
    assert m, "wm size returned no size"
    return int(m.group(1)), int(m.group(2))


def tap_xy(x: int, y: int, wait: float = 1.3) -> None:
    sh("input", "tap", str(x), str(y))
    time.sleep(wait)


def swipe(x1: int, y1: int, x2: int, y2: int, ms: int = 400, wait: float = 0.9) -> None:
    sh("input", "swipe", str(x1), str(y1), str(x2), str(y2), str(ms))
    time.sleep(wait)


def find(
    nodes: list[Node],
    text: str | None = None,
    rid: str | None = None,
    exact: bool = True,
) -> list[Node]:
    res = []
    for n in nodes:
        if rid and n.id != rid:
            continue
        if text is not None:
            ok = n.label == text if exact else re.search(text, n.label) is not None
            if not ok:
                continue
        res.append(n)
    return res


def in_pane(hit: list[Node], pane: str) -> list[Node]:
    """Prefer matches on the requested side of a split screen."""
    if pane == "center":
        return hit
    w, _ = screen()
    return [n for n in hit if (n.x < w * 0.46) == (pane == "left")] or hit


def pane_x(pane: str) -> int:
    w, _ = screen()
    return {"left": int(w * 0.24), "right": int(w * 0.72), "center": w // 2}[pane]


def seek(
    text: str | None = None,
    rid: str | None = None,
    pane: str = "center",
    exact: bool = True,
    top_first: bool = False,
    tries: int = 14,
) -> Node | None:
    """Scroll a pane until a node matches. Small swipes so items are not skipped."""
    _, h = screen()
    x = pane_x(pane)
    if top_first:
        for _ in range(4):
            swipe(x, int(h * 0.3), x, int(h * 0.9), 150, 0.3)
        time.sleep(0.6)
    for direction in ("down", "up"):
        for _ in range(tries):
            hit = in_pane(find(dump(), text, rid, exact), pane)
            if hit:
                return hit[0]
            if direction == "down":
                swipe(x, int(h * 0.65), x, int(h * 0.4))
            else:
                swipe(x, int(h * 0.4), x, int(h * 0.65))
    return None


def row_switch(nodes: list[Node], title: Node) -> Node | None:
    """The switch on the same row as a title, or the first one below it in its row."""
    switches = [n for n in nodes if n.checkable and n.id != "" and "cb_" not in n.id]
    same = [s for s in switches if abs(s.y - title.y) < 50]
    if same:
        return min(same, key=lambda s: abs(s.y - title.y))
    # Only titles in the same column: a split-pane left list reuses the same id.
    same_col = [
        n
        for n in nodes
        if n.id == title.id and n.box[0] < title.box[2] and title.box[0] < n.box[2]
    ]
    switches = [s for s in switches if s.x > title.box[0]]
    titles = sorted(n.y for n in same_col if n.y > title.y)
    nxt = titles[0] if titles else 10**6
    below = [s for s in switches if title.y < s.y < nxt and s.y - title.y < 260]
    return min(below, key=lambda s: s.y) if below else None


DIALOG_IDS = ("alertTitle", "message", "txt_statement")


def dialog(nodes: list[Node]) -> list[str]:
    return [n.label for n in nodes if n.id in DIALOG_IDS and n.label]


class Runner:
    def __init__(self, check: bool, dry: bool, allow_consent: bool) -> None:
        self.check, self.dry, self.allow_consent = check, dry, allow_consent
        self.report: list[tuple[str, str, str]] = []

    def log(self, item: str, state: str, note: str = "") -> None:
        self.report.append((item, state, note))
        print(f"  [{state}] {item}{'  ' + note if note else ''}", flush=True)

    def confirm(self, buttons: list[str]) -> bool:
        nodes = dump()
        text = dialog(nodes)
        if not text:
            return True
        for b in buttons:
            hit = find(nodes, b)
            if hit:
                tap_xy(hit[0].x, hit[0].y)
                return True
        self.log("dialog", "STOP", " | ".join(text)[:120])
        return False

    def locate(
        self, title: str, pane: str, tries: int = 14
    ) -> tuple[Node, Node] | None:
        """Title row and its switch, scrolled into view."""
        if not seek(title, None, pane, tries=tries):
            return None
        _, h = screen()
        x = pane_x(pane)
        for attempt in range(2):
            nodes = dump()
            # A toolbar can carry the same text as the row; take the match with a switch.
            for t in find(nodes, title):
                sw = row_switch(nodes, t)
                if sw:
                    return t, sw
            if attempt == 0:
                # long summaries push the switch below the screen edge
                swipe(x, int(h * 0.6), x, int(h * 0.45))
        return None

    def switch(
        self,
        title: str,
        want_on: bool,
        confirm: list[str],
        pane: str,
        optional: bool = False,
    ) -> None:
        found = self.locate(title, pane, tries=4 if optional else 14)
        if not found:
            present = seek(title, None, pane, tries=2)
            if not present:
                self.log(title, "absent" if optional else "MISSING")
            else:
                self.log(title, "NO-SWITCH", "opens a sub page; add steps for it")
            return
        _, sw = found
        if sw.checked == want_on:
            self.log(title, "on" if want_on else "off", "unchanged")
            return
        if self.check:
            self.log(title, "on" if sw.checked else "off", "WOULD CHANGE")
            return
        if not sw.enabled:
            self.log(title, "LOCKED")
            return
        tap_xy(sw.x, sw.y)
        if not self.confirm(confirm):
            return
        again = self.locate(title, pane, tries=2)
        ok = again is not None and again[1].checked == want_on
        self.log(title, ("on" if want_on else "off") if ok else "FAILED", "changed")

    def step(self, s: dict, cfg: dict) -> bool:
        op = s["do"]
        pane = s.get("pane", cfg.get("pane", "auto"))
        if pane == "auto":
            # Tablets show settings and app setting pages on the right side;
            # swiping in the screen middle can land on a divider and not scroll.
            pane = "right" if cfg["split_settings"] else "center"
        confirm = s.get("confirm", cfg.get("confirm", []))
        if self.dry:
            print("   ", json.dumps(s, ensure_ascii=False))
            return True
        if op == "home":
            sh("input", "keyevent", "HOME")
            time.sleep(0.6)
            sh("input", "keyevent", "HOME")
            time.sleep(s.get("wait", 2.5))  # launcher page animation must settle
        elif op == "back":
            for _ in range(s.get("n", 1)):
                sh("input", "keyevent", "BACK")
                time.sleep(1)
        elif op == "launch":
            # Start from the app's home page, not the sub page left last time.
            # force-stop only ends the process; app data stays.
            sh("am", "force-stop", s["pkg"])
            sh("monkey", "-p", s["pkg"], "-c", "android.intent.category.LAUNCHER", "1")
            time.sleep(s.get("wait", 3.5))
        elif op == "activity":
            out = sh("am", "start", "-n", s["component"])
            if "Exception" in out or "Error" in out:
                self.log(s["component"], "STOP", "activity not startable")
                return False
            time.sleep(2)
        elif op == "settings":
            sh("am", "start", "-a", "android.settings.SETTINGS")
            time.sleep(1.5)
            first, *rest = s["path"]
            node = seek(
                first,
                None,
                "left" if cfg.get("split_settings") else "center",
                top_first=True,
            )
            if not node:
                self.log(first, "MISSING")
                return False
            tap_xy(node.x, node.y, 1.8)
            for name in rest:
                node = seek(name, None, pane, top_first=False)
                if not node:
                    self.log(name, "MISSING")
                    return False
                tap_xy(node.x, node.y, 1.8)
        elif op == "gesture":
            w, h = screen()
            x1, y1, x2, y2 = s["swipe"]
            swipe(
                int(w * x1),
                int(h * y1),
                int(w * x2),
                int(h * y2),
                300,
                s.get("wait", 2.5),
            )
        elif op == "tap":
            # Wait in place first: a cold start may show a splash ad, and a swipe
            # on an ad can open it. Scroll only if the target is still not there.
            node = None
            for _ in range(6):
                hit = in_pane(
                    find(dump(), s.get("text"), s.get("id"), not s.get("regex")), pane
                )
                if hit:
                    node = hit[0]
                    break
                time.sleep(1)
            if not node:
                node = seek(
                    s.get("text"),
                    s.get("id"),
                    pane,
                    exact=not s.get("regex"),
                    tries=s.get("tries", 4),
                )
            if not node:
                if s.get("optional"):
                    return True
                self.log(s.get("text") or s.get("id"), "MISSING")
                return False
            tap_xy(node.x, node.y, s.get("wait", 1.8))
            if confirm and s.get("confirm") and not self.check:
                return self.confirm(confirm)
        elif op in ("off", "on"):
            # "maybe": titles that exist only on some models or versions
            for t in s.get("titles", []):
                self.switch(t, op == "on", confirm, pane)
            for t in s.get("maybe", []):
                self.switch(t, op == "on", confirm, pane, optional=True)
        elif op == "keep":
            for t in s["titles"]:
                found = self.locate(t, pane, tries=4)
                state = "-" if not found else ("on" if found[1].checked else "off")
                self.log(t, state, "kept on purpose")
        elif op == "all_off":
            # list where every row is a switch with the same id, e.g. per-app OAID
            self.all_off(s["id"], pane)
        elif op == "consent":
            # a privacy agreement gates the next screen; the user must decide
            nodes = dump()
            if dialog(nodes) and find(nodes, s.get("agree", "同意并使用")):
                if not self.allow_consent or self.check:
                    self.log(
                        cfg["id"], "NEEDS-CONSENT", " | ".join(dialog(nodes))[:100]
                    )
                    return False
                hit = find(nodes, s.get("agree", "同意并使用"))[0]
                tap_xy(hit.x, hit.y, 2.5)
        elif op == "note":
            self.log(s["text"], "NOTE")
        else:
            raise SystemExit(f"unknown op {op}")
        return True

    def all_off(self, rid: str, pane: str) -> None:
        _, h = screen()
        x = pane_x(pane)
        seen_on, last = 0, None
        for _ in range(60):
            nodes = [n for n in dump() if n.id == rid]
            on = [n for n in nodes if n.checked]
            seen_on += len(on)
            if on and not self.check:
                for n in on:
                    tap_xy(n.x, n.y, 0.8)
            labels = [n.y for n in nodes]
            key = tuple(labels[-3:])
            if key == last:
                break
            last = key
            swipe(x, int(h * 0.8), x, int(h * 0.35))
        self.log(
            f"all {rid}",
            "off" if seen_on == 0 or not self.check else "on",
            f"{seen_on} were on" + ("" if self.check else ", switched off"),
        )

    def run_config(self, cfg: dict) -> None:
        print(f"\n== {cfg['id']}  {cfg.get('name', '')}", flush=True)
        if cfg.get("requires_consent") and not self.allow_consent:
            self.log(cfg["id"], "NEEDS-CONSENT", cfg.get("consent_note", ""))
            return
        if (
            cfg.get("package")
            and not self.dry
            and f"package:{cfg['package']}"
            not in sh("pm", "list", "packages", cfg["package"]).split()
        ):
            self.log(cfg["package"], "NOT-INSTALLED")
            return
        for block in cfg["steps"]:
            if not self.step(block, cfg):
                print("   stopped this config", flush=True)
                break


def load_profile(d: Path) -> tuple[dict, list[dict]]:
    profile = json.loads((d / "profile.json").read_text())
    apps = [
        json.loads((d / "apps" / f"{name}.json").read_text())
        for name in profile["order"]
    ]
    for a in apps:
        a.setdefault(
            "split_settings",
            profile.get("split_settings_on_tablet", False)
            and prop("ro.build.characteristics") == "tablet",
        )
    return profile, apps


def cmd_info(_: argparse.Namespace) -> None:
    keys = [
        "ro.product.brand",
        "ro.product.manufacturer",
        "ro.product.model",
        "ro.vendor.oplus.market.name",
        "ro.product.marketname",
        "ro.build.version.release",
        "ro.build.version.sdk",
        "ro.build.version.oplusrom",
        "ro.miui.ui.version.name",
        "ro.build.version.emui",
        "ro.vivo.os.version",
        "ro.build.display.id",
        "ro.build.characteristics",
    ]
    third = sorted(
        p.split(":", 1)[1] for p in sh("pm", "list", "packages", "-3").split()
    )
    disabled = sorted(
        p.split(":", 1)[1] for p in sh("pm", "list", "packages", "-d").split()
    )
    paths = {}
    for p in third:
        m = re.search(r"codePath=(\S+)", sh("dumpsys", "package", p))
        paths[p] = m.group(1) if m else ""
    print(
        json.dumps(
            {
                "props": {k: prop(k) for k in keys if prop(k)},
                "screen": screen(),
                "third_party": {
                    p: (
                        "preload"
                        if "/my_" in paths[p]
                        or "/del-app" in paths[p]
                        or paths[p].startswith(("/system", "/product", "/vendor"))
                        else "user"
                    )
                    for p in third
                },
                "disabled": disabled,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


def cmd_dump(_: argparse.Namespace) -> None:
    for n in dump():
        if n.label or n.checkable:
            flag = f"[{'on' if n.checked else 'off'}]" if n.checkable else ""
            print(f"{n.label[:60]!r:62} ({n.x},{n.y}) {flag} {n.id}")


def cmd_tap(a: argparse.Namespace) -> None:
    hit = find(dump(), a.text, None, exact=False)
    if not hit:
        raise SystemExit(f"not found: {a.text}")
    n = hit[a.index]
    print(n.label, n.x, n.y)
    tap_xy(n.x, n.y)


def cmd_seek(a: argparse.Namespace) -> None:
    n = seek(a.text, None, a.pane, exact=False)
    if not n:
        raise SystemExit(f"not found: {a.text}")
    print("tapped", n.label)
    tap_xy(n.x, n.y)


def cmd_scan(a: argparse.Namespace) -> None:
    """Scroll a pane and print each title with its row switch state."""
    _, h = screen()
    x = pane_x(a.pane)
    for _ in range(4):
        swipe(x, int(h * 0.3), x, int(h * 0.9), 150, 0.3)
    seen: dict[str, str] = {}
    stale = 0
    while stale < 2:
        nodes = dump()
        new = 0
        for t in nodes:
            if t.id in ("title", "tv_app_label") and t.text and t.text not in seen:
                sw = row_switch(nodes, t)
                seen[t.text] = "-" if not sw else ("on" if sw.checked else "off")
                new += 1
        stale = 0 if new else stale + 1
        swipe(x, int(h * 0.7), x, int(h * 0.4))
    for k, v in seen.items():
        print(f"[{v}] {k}")


def notif_snapshot() -> dict[str, dict[str, int]]:
    lines = sh("dumpsys", "notification", "--noredact").split("\n")
    out: dict[str, dict[str, int]] = {}
    pkg = None
    start = next(i for i, ln in enumerate(lines) if "AppSettings:" in ln)
    for ln in lines[start:]:
        m = re.search(r"AppSettings: (\S+) \(", ln)
        if m:
            pkg = m.group(1)
            continue
        m = re.search(
            r"NotificationChannel\{mId='[^']*', mName=(.*?), mDescription=.*?mImportance=(-?\d+)",
            ln,
        )
        if m and pkg:
            out.setdefault(pkg, {})[m.group(1)] = int(m.group(2))
    return out


def cmd_snapshot(a: argparse.Namespace) -> None:
    Path(a.file).write_text(json.dumps(notif_snapshot(), ensure_ascii=False, indent=1))
    print(a.file)


def cmd_diff(a: argparse.Namespace) -> None:
    x, y = (json.loads(Path(f).read_text()) for f in (a.before, a.after))
    for pkg in sorted(set(x) | set(y)):
        for ch in sorted(set(x.get(pkg, {})) | set(y.get(pkg, {}))):
            b, c = x.get(pkg, {}).get(ch), y.get(pkg, {}).get(ch)
            if b != c:
                print(f"{pkg:34} {ch:16} {b} -> {c}")


def open_app_notifications(pkg: str) -> None:
    # The channel page is single-instance; leave it first or the intent reuses it.
    for _ in range(3):
        sh("input", "keyevent", "BACK")
        time.sleep(0.3)
    sh("input", "keyevent", "HOME")
    time.sleep(0.5)
    sh(
        "am",
        "start",
        "-a",
        "android.settings.APP_NOTIFICATION_SETTINGS",
        "--es",
        "android.provider.extra.APP_PACKAGE",
        pkg,
    )
    time.sleep(2)


def cmd_channels(a: argparse.Namespace) -> None:
    cfg = json.loads((Path(a.profile) / "notifications.json").read_text())
    snap = notif_snapshot()
    for pkg, spec in cfg["apps"].items():
        have = snap.get(pkg, {})
        for ch in spec.get("off", []):
            imp = have.get(ch)
            if imp is None:
                print(f"{pkg} | {ch}: channel not created yet (open the app once)")
                continue
            if imp == 0:
                print(f"{pkg} | {ch}: already off")
                continue
            if a.check:
                print(f"{pkg} | {ch}: ON (importance {imp}) WOULD CHANGE")
                continue
            open_app_notifications(pkg)
            node = seek(ch, "title", "center", tries=8)
            if not node:
                print(f"{pkg} | {ch}: not found in UI")
                continue
            tap_xy(node.x, node.y, 1.5)
            nodes = dump()
            allow = find(nodes, cfg.get("allow_label", "允许通知"))
            sws = [n for n in nodes if n.checkable and n.id == "switch_widget"]
            if not allow or not sws:
                print(f"{pkg} | {ch}: no switch page")
                continue
            sw = min(sws, key=lambda n: abs(n.y - allow[0].y))
            if not sw.enabled:
                print(f"{pkg} | {ch}: LOCKED")
                continue
            tap_xy(sw.x, sw.y)
            print(
                f"{pkg} | {ch}: {'OFF' if notif_snapshot().get(pkg, {}).get(ch) == 0 else 'STILL ON'}"
            )
        for ch in spec.get("keep", []):
            if ch in have:
                print(f"{pkg} | {ch}: kept (importance {have[ch]})")


def cmd_preinstalls(a: argparse.Namespace) -> None:
    cfg = json.loads((Path(a.profile) / "preinstalls.json").read_text())
    installed = {p.split(":", 1)[1] for p in sh("pm", "list", "packages").split()}
    disabled = {p.split(":", 1)[1] for p in sh("pm", "list", "packages", "-d").split()}
    for gid, g in cfg["groups"].items():
        print(f"\n[{gid}] {g['name']}  default={g['default']}\n  impact: {g['impact']}")
        for pkg, label in g["packages"].items():
            st = (
                "absent"
                if pkg not in installed
                else ("disabled" if pkg in disabled else "enabled")
            )
            print(f"  {st:9} {label} ({pkg})")
    print("\nnever touch:", ", ".join(cfg["never_touch"]))


def cmd_disable(a: argparse.Namespace) -> None:
    cfg = json.loads((Path(a.profile) / "preinstalls.json").read_text())
    pkgs = [p for g in a.groups for p in cfg["groups"][g]["packages"]]
    blocked = [p for p in pkgs if any(p.startswith(n) for n in cfg["never_touch"])]
    if blocked:
        raise SystemExit(f"refusing never_touch packages: {blocked}")
    installed = {p.split(":", 1)[1] for p in sh("pm", "list", "packages").split()}
    done = []
    for p in pkgs:
        if p not in installed:
            print(f"{p}: absent")
            continue
        print(p, "->", sh("pm", "disable-user", "--user", "0", p).strip())
        done.append(p)
    disabled = {p.split(":", 1)[1] for p in sh("pm", "list", "packages", "-d").split()}
    print("verified disabled:", all(p in disabled for p in done))
    restore = Path(a.restore)
    restore.write_text(
        "#!/bin/sh\n# Re-enable apps disabled by android-declutter. App data was kept.\n"
        + "".join(f"adb shell pm enable {p}\n" for p in done)
    )
    restore.chmod(0o755)
    print("restore script:", restore)


def main() -> None:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument(
        "-s", "--serial", help="adb device serial when several are connected"
    )
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("info").set_defaults(fn=cmd_info)
    sub.add_parser("dump").set_defaults(fn=cmd_dump)
    p = sub.add_parser("tap")
    p.add_argument("text")
    p.add_argument("index", type=int, nargs="?", default=0)
    p.set_defaults(fn=cmd_tap)
    for name, fn in (("seek", cmd_seek), ("scan", None)):
        p = sub.add_parser(name)
        if name == "seek":
            p.add_argument("text")
        p.add_argument("--pane", choices=["left", "right", "center"], default="center")
        p.set_defaults(fn=fn or cmd_scan)
    p = sub.add_parser("run")
    p.add_argument("profile")
    p.add_argument("--only", action="append", help="config id; repeatable")
    p.add_argument("--check", action="store_true", help="report only, change nothing")
    p.add_argument(
        "--dry-run", action="store_true", help="print steps without touching the device"
    )
    p.add_argument(
        "--allow-consent",
        action="store_true",
        help="tap 同意 on privacy notices; only after the user approved",
    )
    p.set_defaults(fn=None)
    p = sub.add_parser("notif-snapshot")
    p.add_argument("file")
    p.set_defaults(fn=cmd_snapshot)
    p = sub.add_parser("notif-diff")
    p.add_argument("before")
    p.add_argument("after")
    p.set_defaults(fn=cmd_diff)
    p = sub.add_parser("channels")
    p.add_argument("profile")
    p.add_argument("--check", action="store_true")
    p.set_defaults(fn=cmd_channels)
    p = sub.add_parser("preinstalls")
    p.add_argument("profile")
    p.set_defaults(fn=cmd_preinstalls)
    p = sub.add_parser("disable")
    p.add_argument("profile")
    p.add_argument("groups", nargs="+")
    p.add_argument("--restore", default="restore_disabled_apps.sh")
    p.set_defaults(fn=cmd_disable)
    a = ap.parse_args()
    if a.serial:
        SERIAL.extend(["-s", a.serial])
    if a.cmd == "run":
        _, apps = load_profile(Path(a.profile))
        r = Runner(a.check, a.dry_run, a.allow_consent)
        for cfg in apps:
            if a.only and cfg["id"] not in a.only:
                continue
            r.run_config(cfg)
        bad = [
            x for x in r.report if x[1] in ("MISSING", "FAILED", "STOP", "NO-SWITCH")
        ]
        print(f"\n{len(r.report)} items, {len(bad)} need attention")
        sys.exit(1 if bad else 0)
    a.fn(a)


if __name__ == "__main__":
    main()
