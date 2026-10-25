---
name: android-declutter
description: |
  Reduce ads, recommendations, and promotional notifications on an Android phone or
  tablet connected over adb, with declarative per-app JSON configs and a UI-automation
  runner. Covers ad tracking (OAID), personalized ads, 负一屏, 全局搜索, 锁屏, browser,
  app store, theme store, promotional notification channels, ART+ classic icons,
  preinstalled apps, and home screen layout. Verified on OPPO ColorOS 16; other brands
  need a new profile. Use when the user asks to 去广告, 关闭推荐/推送/营销通知, 精简预装,
  换掉营销图标, 整理桌面, or optimize an OPPO/OnePlus/realme/ColorOS (or other Android)
  device through a computer.
metadata:
  requires: adb, python3, a device with USB debugging authorized
---

# Android declutter

Use `scripts/droid.py` for all device work. Replace `<skill-dir>` with the directory
that contains this file.

```bash
D="python3 <skill-dir>/scripts/droid.py"
P="<skill-dir>/profiles/coloros"
```

## Rules the user set (keep them)

- Change only reversible settings without asking: ad, recommendation, and
  promotion switches, and promotional notification channels.
- Never block an app's notifications as a whole. Keep chat, mail, orders and
  delivery, payment, account security, calendar, weather alerts, system updates,
  AI replies, and task-done alerts. Keep unclear channels. Never turn on something
  the user turned off.
- Preinstalls: disable before uninstall. List names and impact, and get approval
  for both. Never judge an app unneeded only because it has no recent use. Never
  touch `never_touch` in `preinstalls.json` (launcher, updates, security, installer,
  account, backup, device links).
- Never clear app data. Never change proxy, VPN, or network settings.
- Privacy agreements (`同意并使用`) are the user's decision. Run with
  `--allow-consent` only for the configs they approved.
- Home screen moves: propose a concrete layout first, move only after approval.
- Report honestly: turning off ad tracking lowers targeting; it does not remove ads.

## Workflow

1. `adb devices -l`. If no device, give the user the USB debugging steps and stop.
2. `$D info` for brand, OS, third-party and preload packages. Pick the profile by
   `profile.json` `match`. With no matching profile, see "New brand" below.
3. Snapshot: `$D notif-snapshot before.json`.
4. Check first: `$D run $P --check`. It changes nothing and lists `WOULD CHANGE`.
5. Apply: `$D run $P` (add `--only <id>` to run single configs). Configs with
   `requires_consent` are skipped until the user approves them.
6. Channels: `$D channels $P --check`, then `$D channels $P`.
7. `$D notif-snapshot after.json && $D notif-diff before.json after.json`; only the
   intended channels may change.
8. Preinstalls: `$D preinstalls $P`, ask the user which groups, then
   `$D disable $P <group>... --restore <path>`. Keep the restore script.
9. Home screen: read `manual` in `profile.json`, propose, then act.
10. Final report: changed, kept, could not handle (with reason), restore script
    path, and a reminder to turn off USB debugging.

## Config format

`profiles/<brand>/profile.json` lists `order`, `match`, `verified_on`, and `manual`
steps. Each `apps/<id>.json` is one entry point:

```json
{
  "id": "browser",
  "package": "com.heytap.browser",
  "confirm": ["关闭"],
  "requires_consent": false,
  "steps": [
    { "do": "launch", "pkg": "com.heytap.browser" },
    { "do": "tap", "id": "menu_wrapper" },
    { "do": "tap", "text": "广告管理" },
    { "do": "off", "titles": ["开屏广告"], "maybe": ["摇一摇广告"] },
    { "do": "keep", "titles": ["默认通知"] }
  ]
}
```

Ops: `home`, `back {n}`, `launch {pkg}` (force-stop first, data kept),
`activity {component}`, `settings {path:[...]}`, `gesture {swipe:[x1,y1,x2,y2]}`
(screen fractions), `tap {text|id, regex, optional}`, `off`/`on {titles, maybe}`,
`keep {titles}` (report only), `all_off {id}` (every row switch in a list),
`consent`, `note`. `confirm` lists dialog buttons that confirm a switch-off. Use
`maybe` for titles that exist only on some models. `notifications.json` maps
package to channel names to turn `off` and to `keep`. `preinstalls.json` holds
disable groups with impact text and the `never_touch` list.

To add an app: open it, use `$D dump` and `$D scan --pane right|center` to read
titles, write `apps/<id>.json`, add the id to `order`, run `--check`, then apply.

## New brand

Copy `profiles/coloros` to `profiles/<brand>`, set `match` from `$D info` props
(MIUI `ro.miui.ui.version.name`, EMUI `ro.build.version.emui`, OriginOS
`ro.vivo.os.version`), and rebuild each config from the real screens. Check that
the brand has a system icon option before you touch icons. Do not install icon
packs or another launcher.

## Gotchas

- Use `uiautomator dump --windows`. A plain dump omits the left pane of
  split-screen Settings on tablets.
- On tablets, left-list and right-page rows share the id `title`. Match rows by
  column; `row_switch` already does.
- After `HOME` or a page swipe, wait about 2.5 s. A dump during the launcher
  animation returns the old page, and a tap lands on the wrong icon. This opened
  阅读 and 电话本 by mistake once.
- `adb shell input text` cannot type Chinese, so Settings search is not usable.
  Navigate by menu titles.
- The notification channel page is single-instance. Press BACK and HOME before
  each `APP_NOTIFICATION_SETTINGS` intent or it reopens the last channel.
- 全局搜索 has no launcher activity: open it with a swipe down on the home screen.
  A swipe up inside it closes it.
- 软件商店 lists have 安装 buttons on every row. Tap only by text or id from a config.
- `ElementTree` elements with no children are falsy. Test `is None`.
- Apps create notification channels on first launch, so unopened apps cannot be
  configured in advance.
- Cross-page icon drags with `input motionevent` need about 2.5 s at the screen edge
  per page and the timing is not stable. Prefer moves within one page.
- If the image viewer shows a screenshot that does not match the device, it can be
  a stale synced file. Write new screenshots to new file names and trust the dump.

## ColorOS 16 findings (2026-10-25)

- Ad tracking: 隐私 > 设备标识与广告 > 广告跟踪 > 更多选项 > 显示系统应用, then
  全部关闭. The page says ad volume does not change.
- 增强服务 has 开机精选应用; phones may also have 商业服务 and 乐划锁屏.
- 桌面、锁屏与个性化 and its 图标 page each need a privacy agreement first. ART+
  图标 is on the 图标 page (`art_switch`), then 应用.
- 天气 and 日历 need a first-run agreement before their in-app settings open.
  Their promotion channels can still be turned off in system notification settings.
- The 小布建议 desktop stack contains the weather card. Turn off its 资讯服务 and
  赛事服务 in 服务推荐设置. Do not uninstall it.
- The tablet browser has no switch for search box hot words.
