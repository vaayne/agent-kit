---
name: humanizer
description: |
  Remove AI writing patterns from prose and make drafts sound like a specific
  human wrote them. Use when drafting, editing, rewriting, reviewing, or cleaning
  copy, essays, docs, posts, emails, UI copy, bios, reports, or any text that
  feels generic, polished-but-dead, promotional, formulaic, or AI-generated.
  Combines comprehensive AI-writing pattern detection with a strict stop-slop
  final pass for direct, specific, human prose.
---

# Humanizer

把文字从“像模型写的”改成“像人写的”。目标不是加口癖，也不是把句子弄乱；目标是保留意思、保留作者意图，同时去掉 AI 腔、宣传腔、模板句式和过度顺滑的假精致。

## 工作方式

1. **先判断任务类型**
   - 用户要“humanize / 去 AI 味 / 改自然” → 重写文本。
   - 用户要“review / 检查 AI 痕迹” → 给出问题清单和修改建议。
   - 用户给了文件路径 → 读文件，按用户要求改写或编辑文件。
   - 用户给了写作样本 → 先校准样本声音，再改目标文本。

2. **保留意思和覆盖范围**
   - 不删核心信息，不偷换立场。
   - 原文覆盖的点，改写后也要覆盖。
   - 如果事实、引用、数据可疑，标出来；不要编新来源补洞。

3. **先查模式，再写草稿**
   - 需要完整审稿时读 `references/ai-writing-patterns.md`。
   - 需要快速强力去 slop 时读 `references/stop-slop-rules.md`。
   - 模式要看“簇”，不要因为一个 em dash、一个 additionally、一个正式词就误伤正常人类写作。

4. **最后做 stop-slop 硬门**
   - 删开场寒暄、meta commentary、filler、假深刻、套话。
   - 主动语态优先，具体名词优先。
   - 最终稿不得包含 em dash 或 en dash。

## 输出格式

默认输出：

```md
## AI tells

- [最重要的 3-6 个问题]

## Rewrite

[最终改写]

## Notes

- [可选：事实风险、语气选择、保留/删除原因]
```

如果用户说“只给最终稿 / final only / 直接改文件”，就跳过解释，只给结果或编辑文件。

## 声音校准

如果用户提供自己的写作样本，先观察：

- 句长：短促、长句、混合？
- 词汇：口语、技术、正式、尖锐？
- 段落开头：直接进入，还是先铺背景？
- 标点习惯：括号、冒号、分号、破折号替代方式？
- 转场方式：显式连接词，还是直接切？

改写时用样本里的节奏和词汇替换 AI 模式。不要把作者声音磨平成“干净但无聊”。

## 改写原则

- **直接**：少宣布，多陈述。
- **具体**：用人、地点、行为、数字、限制条件替代抽象判断。
- **有节奏**：长短句混用。不要三段式口号。
- **有主体**：人或系统做事，不让“数据、市场、文化、决定”假装自己会行动。
- **不过度美化**：不要给普通事实套“重要、关键、深远、变革性”的壳。
- **不乱加个性**：技术文档、法律文本、百科式说明应该朴素；博客、演讲、个人文字才需要更多脾气。

## 快速硬查

交付前检查：

- 有 “Here's the thing / It turns out / Let me be clear / In today's...” 这类开场吗？删。
- 有 “not X, but Y / not just X but also Y / the real question is” 吗？直说 Y。
- 有 passive voice 或 “It is believed that” 吗？找 actor。
- 有 “data tells us / decision emerged / market rewards” 吗？改成人读数据、做决定、买东西。
- 有 rule of three、emoji、bold-label list、Title Case heading 吗？按语境压平。
- 有 em dash `—` 或 en dash `–` 吗？最终稿不允许。
- 有 fake upbeat ending，比如 “the future looks bright” 吗？换成具体下一步或直接停。

## 参考文件

- `references/ai-writing-patterns.md` — comprehensive Humanizer pattern catalog.
- `references/stop-slop-rules.md` — terse hard rules for the final cleanup pass.
