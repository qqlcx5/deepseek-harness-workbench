---
description: "ctx.memory 的会话级消费者：把已存记忆作为持久上下文注入每轮第一步，并在轮次结束时归档对话，面向启用跨会话记忆的用户。"
kind: "package-reference"
---

# @deepseek-ai/dsh-memory-session

[English](README.md) | 中文

<a id="summary"></a>
## 概述

`dsh-memory-session` 把 agent 循环接到 `ctx.memory`。每轮第一步时，它针对被认领的用户文本检索记忆，并把命中追加为一条持久的 `recall` 形态用户消息，因此注入的上下文与其他对话内容一样可持久化、可回放、可压缩。轮次停止时，它通过接缝归档该轮的用户与助手消息，且不拖延轮次边界。两条路径在记忆失败时都降级为日志警告——记忆绝不阻塞一轮。本插件是可选的：默认组合不启用它。

<a id="table-of-contents"></a>
## 目录

- [使用本包](#use-this-package)
- [Model Experience](#model-experience)
- [已知局限与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

当希望过去的会话启发新的轮次、完成的轮次累积为记忆时，把本插件与 `dsh-memory` 及某个 provider 一起挂载。检索每轮一次（第 1 步），以被认领消息的文本为查询；同轮后续步骤不再检索。归档在停止边界读取持久会话日志，只写用户来源与助手消息——插件注入的上下文可再注入，永不归档。

### 配置

最小挂载无需配置。

```yaml
- name: '@deepseek-ai/dsh-memory-session'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `recall` | `true` | 在每轮第一步检索已存记忆 |
| `archive` | `true` | 归档每个完成轮次的用户/助手消息 |
| `maxHits` | `8` | 单轮检索命中的上限 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-memory-session)是所有可接受字段及其 JSDoc 的穷尽来源。

-----

<a id="model-experience"></a>
## Model Experience

### 召回记忆上下文

#### 模型看到什么

只要检索有命中，就有一条用户角色消息追加到该轮第一步。`<bullets>` 是每个命中一行 `- (<layer>[, <timestamp>]) <text>`，layer 为 `conversation` 或 `atomic`。

##### 召回记忆文本

```markdown
Recalled memory relevant to this turn:
<bullets>
```

#### Token effect

条件性：有命中的轮各加一条消息，每条由 `maxHits` 限制命中正文长度；检索无命中的轮不增加 token。

#### KV Cache effect

追加式；召回消息跟在该轮被认领的消息之后，不会使已可复用的前缀失效。某轮的检索结果与上一轮不同，也只改变该轮的后缀。

<a id="known-limitations-and-deferred-work"></a>
## 已知局限与延期工作

- **检索增加首步延迟** —— pre-step waterfall 在步骤进入前等待 provider；慢的记忆端点会拖延每个首步。
- **归档是发后即忘** —— record 失败在轮次关闭后以日志呈现；没有重试，也没有失败归档的持久记录。
- **每轮只有一个查询** —— 查询仅为被认领消息的文本；纯图片或工具结果的认领不会触发检索。
- **后续步骤不再注入** —— 轮中通过其他途径检索到的记忆（例如未来的 `memory_search` 工具）不会刷新该轮已注入的上下文。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文 —— 点击展开</summary>

无。

</details>
