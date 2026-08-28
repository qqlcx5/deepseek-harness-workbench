---
description: "ctx.memory 的 TencentDB Agent Memory provider：对接 MemoryCore v3 端点的 L0/L1 检索与 L0 归档，面向把 harness 接入 Memory Hub 的运维者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-memory-tencentdb

[English](README.md) | 中文

<a id="summary"></a>
## 概述

`dsh-memory-tencentdb` 向 `ctx.memory` 注册唯一的 `MemoryProvider`（`tencentdb`），由官方 TypeScript SDK 对接 [TencentDB Agent Memory](https://github.com/Tencent/TencentDB-Agent-Memory) 的 MemoryCore v3 端点。检索并行搜索 L0 会话库与 L1 原子记忆库并按得分降序合并命中；归档把完成的轮次写为 L0 消息。隔离是严格的：`teamId`/`agentId`/`userId` 在加载时确定记忆命名空间，每个请求携带调用会话的 id。

<a id="table-of-contents"></a>
## 目录

- [使用本包](#use-this-package)
- [Model Experience](#model-experience)
- [已知局限与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

当 Memory Hub 实例存储团队记忆时，把本插件与 `dsh-memory` 一起挂载。端点、实例与严格隔离身份是加载期必填项：缺字段会令插件加载失败。API key 回退到启动环境中的 `$TDAI_USER_KEY`。

```yaml
- name: '@deepseek-ai/dsh-memory-tencentdb'
  config:
    endpoint: http://127.0.0.1:8420
    serviceId: mem-inst-1
    teamId: team-1
    agentId: agt-1
    userId: usr-1
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `endpoint` | 必填 | MemoryCore 基础 URL |
| `apiKey` | `$TDAI_USER_KEY` | Memory Hub 面板发放的 Bearer key |
| `serviceId` | 必填 | 记忆实例 id（`x-tdai-service-id`） |
| `teamId` / `agentId` / `userId` | 必填 | 严格隔离命名空间 |
| `taskId` | 无 | 可选的任务维度，随每个请求携带 |
| `layerLimit` | `8` | 向每层后端搜索请求的命中数 |
| `timeoutMs` | `30000` | SDK 传输层请求超时 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-memory-tencentdb)是所有可接受字段及其 JSDoc 的穷尽来源。

### 检索返回什么

会话命中携带 `layer: 'conversation'`、说话者角色以及后端提供时的消息时间戳；原子命中携带 `layer: 'atomic'` 与其 `updated_at`。provider 按后端得分降序排列合并后的列表；接缝按消费者给的 limit 截断。

-----

<a id="model-experience"></a>
## Model Experience

间接生效，经由 [`dsh-memory-session`](../memory-session/README.zh.md#model-experience)：本包提供排序命中与归档，自身不注入模型可见内容。

#### KV Cache effect

provider 不发起模型请求、不增加请求 token；消费者持有的注入是追加式的，不会使已可复用的前缀失效。

<a id="known-limitations-and-deferred-work"></a>
## 已知局限与延期工作

- **不检索 L2/L3** —— provider 搜索 L0 会话与 L1 原子记忆；场景（L2）与人设（L3）资产仍只能通过 Memory Hub 面板访问。
- **取消是尽力而为** —— SDK 传输层只认自身配置的超时；`AbortSignal` 在每次后端调用前检查，无法取消已发出的调用。
- **得分不跨实例可比** —— 合并假设同一后端为两层打分；在一个 provider id 后面混用端点会导致排序不一致。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文 —— 点击展开</summary>

无。

</details>
