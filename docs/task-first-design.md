# Task-first bb 工作流设计

状态：设计稿，未实现。目标读者：V。

## 0. 一句话

把 bb 的工作单位从"线程"换成"Task"：Task 是持久的意图，线程是一次尝试，
状态由事实推导；界面永远只把"现在轮到你的那一件"推到眼前，其余全部安静。

## 1. 为什么做这个

不是为了"追踪更全"，是为了把大脑里不该放的东西搬出来。ADHD 的几个硬约束，
每一条都对应今天工作流里一个真实的痛点：

| 约束 | 今天的症状 | 设计必须做到 |
| --- | --- | --- |
| 工作记忆小，存不住"还有什么没完" | 643 个线程只有 74 个 task；进度靠翻侧栏回忆 | 意图落盘在线程之前，不依赖记忆 |
| 视野外即不存在 | 31/74 个 task 卡在 in_review，没人关 | 需要你的事主动浮上来，不需要你的事主动消失 |
| 再入成本高，被打断后回不来 | 打开一个线程要读半屏才知道到哪了 | 任何 task 十秒内回答"在哪、下一步是什么" |
| 启动摩擦，成本高就不开始 | 建 task 比直接开线程多两步，于是绕过 | "我要做 X"一步产生 task 和首个线程 |
| 时间盲 | 看不出一件事已经三天没动 | 显示"多久没动"，不显示绝对时间 |
| 决策疲劳 | 二十个 in_review 摆在一起，不知道先看哪个 | 屏幕任何时候只给一个明确的下一个动作 |
| 超专注需要保护 | 子线程完成的通知打断当前事 | 通知聚合到 task，不弹，回来再看 |
| 需要完成感 | done 是一个没人触发的手工动作 | done 自动到达，且有可见的收尾 |

判断标准：每一条设计决策都能回指到上表的一行。指不到的，砍掉。

## 2. 核心模型

三个对象，只有一个是层级根：

**Task：持久的意图。** 在第一个线程之前存在，活过多次尝试、多个 session、
换模型重派、compaction。回答"要做什么、到哪了、下一步谁动"。

**Thread：一次尝试。** 短命，绑定一个 environment 和一个 provider。
永远属于某个 task（或 Unfiled 桶）。子线程继承父线程的 task。

**Environment / PR / 附件：Task 或 Thread 上的属性。** 不是导航层级。

**Project：Task 上的 facet。** 用 key 前缀（`STELLA-23`）和顶部 filter 表达，
不做可折叠层级。理由：两个大项目一层折叠不掉噪音，小项目又不需要归类，
而且解锁跨项目 task。bb project 作为数据仍然存在，线程和 environment 归它。

导航结构：**Task → 线程树**，就这一层半。

### Task 上的一等字段

除了 tasks plugin 已有的 title / description / status / priority / labels：

- `next`：一句话，"下一步谁做什么"。由最后一个动过它的 agent 或你维护。
  这是再入卡片的核心，缺它整个设计不成立。
- `waitingOn`：`you` / `agent` / `ci` / `nobody`。推导得出，见状态机。
- `lastMovedAt`：最近一次真实进展的时间（线程 turn 完成、PR 事件、评论）。
  用于"多久没动"。

`next` 用 task comment 承载：最新一条首行以 `Next:` 开头的评论就是它。
评论是追加式、带时间戳、agent 已经在写，不像 description 那样多 agent 并发会互相
覆盖。`waitingOn` 和 `lastMovedAt` 纯推导，不落库。schema 升级触发条件：
需要在 Tasks 自带看板里也显示 `next` 时。

## 3. 状态：从事实推导，手填只做覆盖

| 事实 | 推导状态 | waitingOn |
| --- | --- | --- |
| 没有任何线程，status 是 backlog / todo | `backlog`（未开始，不进"轮到你"） | you |
| 没有任何线程，status 却是 in_progress / in_review | `stalled` | **you**（没有线程记录，写 next 或关掉） |
| 任一线程 running | `in_progress` | agent |
| 任一线程 waiting-for-input 或 error | `in_progress` | **you** |
| 线程全停，PR 打开，CI 在跑 | `in_review` | ci |
| 线程全停，PR 打开，CI 完成 | `in_review` | **you** |
| 线程全停，没有 PR，`next` 为空 | `in_review` | **you**（要么关掉，要么写 next） |
| PR 合并 | `done` | nobody |
| 手动 cancel / 手动 done | 覆盖，冻结推导 | nobody |

规则：状态永远可以从线程和 PR 重算出来；手动只保留 `canceled` 和强制 `done`
两个覆盖。原因回指第 1 节第二行：手填状态一定会漂。

"需要你"的定义就是 `waitingOn = you`。这是整个 UI 唯一需要高亮的东西。

## 4. 三个面

全部作为一个 bb plugin，共用一份状态推导逻辑。SDK 0.4.3 已提供全部挂点：
`experimental_threadList`（侧栏替换）、`threadPanelAction`（线程右侧面板）、
`navPanel`（插件独占路由页）。

### 4.1 侧栏：Task 列表

- 三个分段，固定顺序：**轮到你**、**在跑**、**其它**。前两段默认展开，
  第三段默认折叠且只显示数量。回指：视野外即不存在的反面，不需要你的事主动消失。
- 每行：key、标题、`next` 的前 40 字、"多久没动"（`now / 5m / 2h / 3d`），
  超过 3 天没动的用暗色，不用红色。回指：时间盲，且不制造焦虑。
- 展开一个 task 显示线程树（父子缩进）和 PR 一行。线程行沿用 navigator 的
  状态槽和 hover 操作。
- 顶部一个 project filter chip 行，多选，默认全选。搜索匹配 key、标题、`next`。
- Unfiled 桶：最近 7 天没绑 task 的根线程，放"其它"段最末。可以一键"归入 task"
  或"变成 task"。只看 7 天：它是提醒你归档，不是全部历史。
- 第四段**最近完成**（30 天内结束、有线程的 task），默认折叠。存在的唯一理由是
  已结束 task 的线程仍然要点得开；侧栏是整体替换的，这里不放就无路可达。
- 底部一行 usage（"Claude 42% · Codex 6%"），贴着设置按钮上方，点开看每个窗口。
  沿用 workspace-navigator 的取数，只是从顶部第一段降到底部一行，少抢注意力。
- 没有计数徽章，没有 provider 名，没有未读点。沿用 navigator 已经验证过的克制。

### 4.2 线程面板：这个线程属于什么

- 打开任意线程，右侧面板显示所属 task 的再入卡片：标题、状态、`next`、
  兄弟线程、PR。
- 这里可以改绑、新建 task 并把当前线程归进去。这是 Unfiled 数字下降的地方。
- 卡片顶部一行"你上次在这里做到"：该线程最后一条 agent 消息的首句。
  回指：再入成本。

### 4.3 收件箱页：现在轮到我的

- `navPanel` 一整页，只列 `waitingOn = you` 的 task，每个 task 一张卡：
  标题、为什么轮到你（agent 提问原文 / PR 待 review / 线程停了没 next）、
  一个主动作按钮。
- **每次只显示一张卡**，其余折成"还有 N 件"。回指：决策疲劳，一次一件。
- 主动作按钮就是直接在卡上完成：回答问题、打开 PR、写 next 或点 done。
- 空状态是设计目标之一，要有明确的"没有事轮到你"，不是空白。回指：完成感。

同一路由的主页面是**全景**，收件箱是它右侧面板里的固定 tab（一张卡本来就只要
窄栏）。全景是"全局看一眼"的视图，给每天开始和每周 review 两个时刻用：

- 一块看板，列是推导出的 `waitingOn` 而不是 status，固定顺序：**等你**、**在跑**、
  **等 CI / 等别人**、**停了**、**未开始**、**最近完成**。卡片随事实自动换列，
  没有拖拽。未开始单独放后面：它是一个待做的选择，不是打断，混进"等你"会把收件箱
  淹掉。"停了"单独拎出来，因为它就是今天漂掉的那类（31 个卡在 in_review），
  不单独显示就永远不会被处理。
- 每张卡 key、标题、`next`（没有就是 reason）、多久没动、线程数、open PR。
  顶部 project chip 过滤。
- 按 status 分列回答"在流水线哪一段"，那是漂掉的字段；按 `waitingOn` 分列回答
  "谁该动"，那才是看一眼要的答案。列是形式，推导才是内容。
- done 只留"最近完成"一列（30 天内、有线程的），暗色；再往前的历史去 Tasks 页。
  顶栏一个"本周完成 N 件"。回指：完成感，且已结束 task 的线程仍然能从这里点开。
- 一个"归档 30 天没动的"批量动作。第一次打开时"停了"会装满旧 task，
  没有这个动作会吓退人。server 端重新推导后只取消真正超期的，页面放旧了也不会
  误伤复活的 task。

### 4.4 启动入口

- 新线程 composer 里加一个动作：**先建 task**。输入一句标题，自动创建 task
  并把即将开始的线程绑上。一步。回指：启动摩擦。
- 反向也要能走：一个已经在跑的线程，一键"提升为 task"，标题取线程标题。
  目的是允许随手试探，事后归档，而不是强迫先分类。

### 4.5 明确不做

- 不做 WIP 上限强制。显示"在跑 N 件"就够，强制会被绕过。
- 不做 status 分列的看板。bb Tasks 自带的那页保留，需要时开它；本 plugin 的
  全景是按 `waitingOn` 分列的看板，列由事实推导，不能手动拖。
- 不做 due date 提醒。时间盲的解药是"多久没动"，不是 deadline。
- 不做通知弹窗。所有"需要你"只在侧栏和收件箱里出现。回指：超专注保护。

## 5. 绑定和数据：plugin 自动做，agent 只管 next

实验（2026-08-26，PERSONAL-1）和 SDK 0.4.21 类型核对后的分工：

**plugin 自动做的：**

1. **子线程自动继承 task。** 订阅 `bb.events.on("thread.created")`，payload 里有
   `parentThreadId`，沿父链向上找到第一个已绑定的线程，调
   `bb.sdk.plugins.callRpc({ pluginId: "tasks", method: "taskThreadsAttach" })`
   绑上。内置 tasks plugin 自己不做这件事：它的 `thread.created` 处理器只更新
   已跟踪线程的 liveStatus，不看 parent。实验证实 dispatch 出的
   thr_rxz39zzsne 已绑定，它 spawn 的 thr_2yu95uffus 没绑。
2. **给子线程注入 task 上下文。** `bb.agents.configure(ctx)` 的 ctx 带
   `thread.parentThreadId`，同一条父链查找后，往 `instructions` 里注入
   "你属于 STELLA-23，结束前更新 next 并写一条 comment"。agent 不需要记得任何事。
3. **状态推导。** 线程侧用 `thread.active / idle / failed / deleted` 事件加
   `bb.sdk.threads.list`；PR 侧复用 navigator 的 `environments.pullRequest` 缓存；
   task 侧走 `callRpc` 读 `listTasks / getTask / listTaskThreads`。

**agent 仍然要做的（进 `_AGENTS.md` 和 tasks skill 的补充）：**

1. 线程结束前更新 task 的 `next`（写"无"也算），并写一条结论 comment。
   这是"线程死了 task 还活着"的唯一人工环节，其余都自动。
2. spec-dev 的 plan.md 挂为 task attachment；mason 每个 phase 完成写一条 comment。
3. 根线程从 4.4 的入口或 `bb tasks dispatch` 起。随手开的线程进 Unfiled，事后提升。

## 6. 假设验证结果

| 假设 | 结果 | 影响 |
| --- | --- | --- |
| dispatch 子线程自动进 task | **否**。绑定不传递 | 由本 plugin 用 `thread.created` + parent 链补上 |
| 跨 plugin 读 tasks 数据 | **可以**。server 侧 `bb.sdk.plugins.callRpc`；tasks 暴露 `listTasks / getTask / listTaskThreads / taskThreadsAttach / taskThreadsDetach / delegate` | 不需要自己维护绑定表，状态推导在本 plugin server 侧做 |
| 线程数据含 waiting-for-input 和 PR | 是，navigator 已在用 `hasPendingInteraction` 和 `environments.pullRequest` | 直接复用 |
| 能否给子线程自动注入 task 上下文 | **可以**。`agents.configure` 拿到 `parentThreadId` | 约定层缩到"结束前更新 next"一条 |

仍未验证、但风险低：另一个 plugin 调 tasks 的 `callRpc` 是否有权限限制；
`agents.configure` 的注入和 tasks 自带 skill 是否会重复。都是动手第一天能知道的事。

UI 挂点冲突检查：tasks 自带 UI 占了 `navPanel`（它的看板页）、`threadPanelAction`
（::task 卡片）、`messageDirective`。本 plugin 用 `experimental_threadList` 和自己的
`navPanel` 路由，线程面板复用它的卡片而不是再做一个。4.2 相应缩小：只在它的
卡片之上补"你上次在这里做到"和改绑动作，能复用就不重做。

## 7. 顺序（不是排期）

1. 两个实验。已完成，见第 6 节。
2. Agent 约定先落，只剩"结束前更新 next"一条，半天的事。
3. 侧栏。它同时是导航和状态视图，能最早验证"按 task 组织"对不对。
4. 线程面板。它决定覆盖率。
5. 收件箱。它依赖前面把数据喂饱。

每一步都能单独停下来用。
