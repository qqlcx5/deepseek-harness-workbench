---
description: "memory 组地图：智能体记忆能力接缝及其 provider 与会话消费者，面向浏览本组的用户与维护者。"
kind: "package-group"
---

# memory/ —— 智能体记忆能力接缝

[English](README.md) | 中文

<a id="summary"></a>
## 概述

memory 组通过一个能力接缝为智能体提供跨会话的持久记忆：`dsh-memory` 定义带 provider 选择的 recall 与 record 的 `ctx.memory`；`dsh-memory-tencentdb` 对接 TencentDB Agent Memory 的 MemoryCore v3 端点实现 provider；`dsh-memory-session` 把已存记忆作为持久上下文注入每轮第一步，并归档完成的轮次。所有包均为可选；默认组合一个也不挂载。本页只做组地图；各包 README 拥有各自的包级契约。

<a id="table-of-contents"></a>
## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 角色 | ctx key |
|---|---|---|
| [`memory/`](memory/README.zh.md) | Service Definition：provider 注册表与统一选择策略的 recall/record 执行 | `ctx.memory` |
| [`memory-tencentdb/`](memory-tencentdb/README.zh.md) | Service Provider：对接 MemoryCore v3 的 L0/L1 检索与 L0 归档 | — |
| [`memory-session/`](memory-session/README.zh.md) | Consumer：通过接缝的逐轮召回注入与轮次归档 | — |

-----

<a id="related-documentation"></a>
## 相关文档

- [生成的配置目录](../../docs/config-catalog.zh.md) —— 本组各包接受的全部配置字段。
- [Memory 子系统](../../docs/subsystems/memory.zh.md) —— 接缝的选择策略、词汇与会话消费者集成。
- [TencentDB Agent Memory](https://github.com/Tencent/TencentDB-Agent-Memory) —— 本组 provider 对接的上游记忆服务。

-----


## Dev Note

<details>
<summary>维护者的工作上下文 —— 点击展开</summary>

无。

</details>
