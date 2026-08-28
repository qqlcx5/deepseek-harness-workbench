---
description: "智能体记忆服务（ctx.memory）：部署方与插件作者如何通过可替换的 provider 检索已存记忆并归档对话，含统一的选择策略与错误词汇表。"
kind: "package-reference"
---

# @deepseek-ai/dsh-memory

[English](README.md) | 中文

<a id="summary"></a>
## 概述

`dsh-memory` 是记忆能力接缝的 Service Definition：以 `ctx.memory` 暴露唯一的 provider 注册表，并提供调用时选择 provider 的 `recall()` 与 `record()` 执行。provider 为一次查询提供按相关性排序的记忆命中，并以会话隔离键归档完成的对话片段。选择与注册顺序无关：配置的 provider id 必须存在且可用；未配置时要求恰好一个可用 provider。内置 provider 是 [`dsh-memory-tencentdb`](../memory-tencentdb/README.zh.md)；会话消费者是 [`dsh-memory-session`](../memory-session/README.zh.md)。

<a id="table-of-contents"></a>
## 目录

- [使用本包](#use-this-package)
- [Model Experience](#model-experience)
- [已知局限与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

部署方挂载本包一次以暴露 `ctx.memory`；provider 包向其注册，消费者包驱动它。接缝本身不含后端：没有已注册且可用的 provider 时，`recall()`/`record()` 抛出带下列错误码的 `MemoryError`。

### 扩展点

- `registerMemoryProvider(provider)` —— 以 provider 的 `id` 注册一个 `MemoryProvider`；返回反注册器。重复 id 抛 `MEMORY_DUPLICATE_PROVIDER`。
- `recall(request, signal?)` —— 在会话作用域下检索与查询相关的排序命中；接缝按 `request.limit` 截断。
- `record(request, signal?)` —— 在会话作用域下归档一段完成的对话。

### 选择策略

| 配置的 `provider` | 已注册 provider | 结果 |
|---|---|---|
| 已设 | id 已注册且 `available()` | 该 provider |
| 已设 | id 未注册 | `MEMORY_PROVIDER_CONFIGURED_MISSING` |
| 已设 | id 已注册但不可用 | `MEMORY_PROVIDER_CONFIGURED_UNAVAILABLE` |
| 省略 | 恰好一个可用 | 该 provider |
| 省略 | 多个可用 | `MEMORY_PROVIDER_AMBIGUOUS` |
| 省略 | 无可用 | `MEMORY_PROVIDER_UNAVAILABLE` |

`$DSH_MEMORY_PROVIDER` 与 `provider` 字段等价，不是隐藏的优先级链。

```yaml
- name: '@deepseek-ai/dsh-memory'
  config:
    provider: tencentdb
```

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-memory)是所有可接受字段及其 JSDoc 的穷尽来源。

-----

<a id="model-experience"></a>
## Model Experience

间接生效，经由 [`dsh-memory-session`](../memory-session/README.zh.md#model-experience)：本包定义接缝并选择 provider，自身不注入模型可见内容。

#### KV Cache effect

接缝不发起模型请求、不增加请求 token；消费者持有的注入是追加式的，不会使已可复用的前缀失效。

<a id="known-limitations-and-deferred-work"></a>
## 已知局限与延期工作

- **写入不去重** —— `record()` 原样存储消费者提交的内容；把同一轮重放进活跃 provider 会写入重复片段。轮次边界检测由消费者负责。
- **无跨会话聚合** —— 隔离以调用方的 `sessionId` 为键；跨会话聚合属于 provider 行为，不在接缝内。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文 —— 点击展开</summary>

无。

</details>
