# Magpie connector

把 BB 的 Pi、Codex 和 Claude Code 接入 BB server 上的一台 Magpie。Magpie 负责账户、模型和调度。插件负责 Pi 配置同步与请求转发。

```text
MacBook / Mac mini / netcup 的 BB Pi
  → 该机器已有的 BB 连接
  → BB server 上的 Magpie 插件
  → http://127.0.0.1:3425
  → Magpie 管理的模型
```

Pi 使用配置同步。原生 Codex 和 Claude Code 按线程开启路由。Account Pooler 的全局设置保持原值。

## 原生 Codex 和 Claude Code

网关启动后，对准备测试的 BB 线程执行：

```sh
bb magpie check --native
bb pool bypass <thread-id>
bb magpie route <thread-id>
```

然后向该线程发送测试消息。`route` 只改变指定线程的下一轮请求。插件复用 Account Pooler 的环境注入机制，Codex 使用 Responses API，Claude Code 使用 Messages API。Codex 自带的登录头会被替换，不会传给 Magpie。

模型 ID 必须由 Magpie 提供。启动网关不保证已经配置 Claude 模型。可以先检查 `http://127.0.0.1:3425/v1/models`。

恢复测试线程：

```sh
bb magpie route <thread-id> --off
bb pool bypass <thread-id> --off
```

如果没有启用 Account Pooler，可以省略 `bb pool bypass`。全局切换暂未提供，先用独立线程验证路由。

## 安装

源码保存在 agent-kit 的 `bb-extensions/magpie/`。Pi 扩展由 `pi-extension.ts` 生成；不要编辑各机器上的生成文件。

```sh
cd bb-extensions/magpie
npm ci --include=dev --legacy-peer-deps
bb plugin build .
bb plugin install . --yes
```

插件沿用 `magpie` 插件 ID。已有安装升级后，下一次同步将 Pi provider 从 `bb-magpie` 改为 `magpie`，并删除原扩展入口。账号配置和插件恢复记录保留。

## 使用

1. 在 BB server 所在机器启动并配置 Magpie。
2. 用 Magpie 为 Pi 选择一个模型。`magpie models pi` 列出可选模型，`magpie pi <provider/model>` 选择模型。
3. 运行检查与同步：

   ```sh
   bb magpie check
   bb magpie sync
   ```

4. 等正在运行的 Pi 线程结束，再刷新 Pi provider：

   ```sh
   bb plugin reload provider-pi
   ```

5. 新建 BB 线程，选择 **Pi**，再选择 `magpie/<provider>/<model>`。

`sync` 默认同步所有已连接的常驻机器。`--machine MacMini` 只同步指定机器。自动同步默认开启，每 30 秒检查一次模型目录，并在机器重连后重试。模型目录发生变化时，插件会在 Pi 线程全部空闲后刷新 Pi provider。BB 模型选择器可能缓存旧目录最多约 10 分钟；已有 Pi 会话需要重新启动。

```sh
bb magpie status
bb magpie sync --machine MacMini
```

## 配置来源与影响

插件读取 BB server 上 `~/.pi/agent/models.json` 的 `providers.magpie`。这个配置由 Magpie 生成，包含各模型使用的 API 协议、推理选项和上下文限制。插件读取同目录的 `settings.json` 以确定默认模型。

各执行机器会收到一个 Pi 扩展：`~/.pi/agent/extensions/magpie/index.js`。插件会修改 Pi 的 `defaultProvider`、`defaultModel` 和 `enabledModels`。插件保存这三个字段的旧值，并保留其他设置。插件不修改 `models.json` 和 `auth.json`。

这些默认设置也适用于在终端直接启动的 Pi。`magpie` 需要 BB 注入的代理地址与令牌，所以应从 BB 启动测试线程。在终端使用其他 Pi provider 时，请显式选择该 provider，或先运行恢复命令。

如果机器使用 `PI_CODING_AGENT_DIR`，BB daemon 与 Pi 必须使用同一个目录。项目自己的 Pi 设置可以覆盖全局默认值。插件配置默认路由，不阻止用户显式选择其他 provider。

Magpie 的上游凭据只留在服务器。机器收到的是模型信息和 BB 分配的机器代理令牌。插件不会执行 Magpie 配置里的 `apiKey` 命令，也不会复制源配置中的凭据、请求头或地址。

## 插件设置

默认网关是 `http://127.0.0.1:3425`。网关与 BB server 在同一台机器时，不需要对外开放 Magpie 端口。

```sh
bb plugin config magpie set gatewayUrl http://127.0.0.1:3425
bb plugin config magpie set piAgentDir /absolute/path/to/.pi/agent
```

如果网关要求密钥，请在 BB 的 Magpie 插件设置中填写 `gatewayKey`。不要把密钥写进代码或命令历史。`proxySecret` 由插件生成；修改这个值会使现有机器令牌失效。清空后需重新加载插件。

## 恢复

先在所有已同步机器连接时运行：

```sh
bb magpie remove
bb plugin reload provider-pi
```

`remove` 删除插件写入的 Pi 扩展，并恢复三个选择字段。用户在同步后自行修改的字段会保留。确认恢复完成后，再禁用或卸载插件。单独禁用插件不会恢复各机器上的 Pi 文件。

## 验证与构建

需要 Node.js 24 和已安装的 Pi CLI。验证只使用本机临时 HTTP 服务，不调用真实模型账户。

```sh
npm ci --include=dev --legacy-peer-deps
npm run typecheck
npm test
npm run verify:pi
bb plugin build .
```

`verify:pi` 使用真实 Pi CLI 验证模型发现和三种流式 API。验证记录保存在 `.artifacts/pi-e2e.json`。`npm test` 检查鉴权、请求头隔离、流式取消、上游错误与配置恢复。

研究依据：Magpie [Pi 配置生成代码](https://github.com/yetone/magpie/blob/76db4c6c2813f270aeaaf0c16ff97a62f2c8018f/internal/agent/agents.go#L927)，以及 BB Plugin SDK 0.6.37。插件复用 BB 内置 Pi provider，不增加新的 agent provider。
