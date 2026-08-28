# Agent Note: TencentDB Agent Memory 能力接缝

Status: implemented

[English](2026-08-28-tencentdb-agent-memory-capability-seam.md) | 中文

## 问题

TencentDB Agent Memory 为 agent harness 提供了两种集成形态，都不符合本仓库的插件模型。Memory Proxy 路线在服务端改写模型流量：它要求把 harness 的 LLM provider 指向代理，把记忆注入耦合到单一路由上，无法服务保持自有模型路由的部署。上游的 `pi-plugin` 出于同样原因注册了一整个 provider——它路由请求，所以记忆只存在于承载它的那个 provider。两种形态都没给 harness 一个能扛住 provider 更换的记忆能力，也都没接入持久会话日志，注入的记忆会活在"模型可见即可回放"不变式之外。

## 决策

**记忆是能力接缝，不是 provider 路由。** `dsh-memory` 定义 `ctx.memory`，选择语义与 `ctx.web` 相同：provider 注册表、执行期解析（配置的 id 必须存在且可用；否则要求恰好一个可用 provider）、provider 无关的 `MemoryHit`/`MemoryTurnMessage` 词汇。接缝不持有后端、不注入任何东西；更换 provider 即移动整个能力，与 shell、web 接缝一致。

**官方 SDK 是传输层，不是手写客户端。** `dsh-memory-tencentdb` 包装 `@tencentdb-agent-memory/memory-sdk-ts-v2`，而不是重新实现 v3 严格隔离 API。SDK 的 `Transport` 构造器让 provider 无网络即可测试；`withIsolation({ sessionId })` 每次调用派生一个客户端视图，因此作用域永远是调用会话的 id，绝不是插件级常量。检索并行搜索 L0 会话与 L1 原子记忆并按后端得分降序合并；截断到消费者的 limit 由接缝完成而非 provider，与 `capSources` 同构。

**消费者骑在循环既有的扩展点上。** `dsh-memory-session` 在每轮第一步通过 `agent/pre-step` waterfall 检索，把命中追加为一条 `form: 'recall'` 的持久用户消息——从其他会话提取的材料，正是该 form 的声明含义。归档在 `agent/turn-stopping` 边界读取持久日志，只写用户来源与助手消息：插件注入的上下文可再注入，归档它会在下次召回时重复。record 失败在轮次关闭后以日志呈现；记忆绝不阻塞或拖延轮次边界（检索被等待，因为模型必须看到其结果；归档发后即忘，因为下游无人读它）。

**降级是警告，绝不是轮次失败。** 检索出错或 provider 不可用时记日志并原样返回 decision；轮次无记忆继续。这与 web 工具不同——后者把 provider 失败作为结构化工具错误呈给模型：那里是模型在请求，这里用户没有。

**放弃了什么。** L2 场景与 L3 人设不做召回（上游仅面板可及）；取消是尽力而为，因为 SDK 传输层只认自身配置的超时；检索查询仅为被认领消息的文本，纯图片认领不触发召回。每条都记录在包 README 的局限里，而不是藏在回退后面。

## 后果

记忆从此走在标准组合路径上：部署方挂载三个可选包即启用跨会话记忆，provider 路由不变，召回文本进入持久日志，压缩、回放与遥测照常运作。`memory` 这个 ctx key 为未来的 provider（向量库、本地 sqlite 后端）保留了接缝名，消费者无需改动。锁定 beta 的 SDK 依赖是该组第一个外部运行时依赖，且止步于 provider 包边界，接缝与消费者在没有它时也能编译。

## 考虑过的备选

- **Proxy 路线**（上游文档化的 dsh 集成）：零代码，但记忆与单一 LLM provider 路由不可分，且绕过会话日志。保留为运维者在这条接缝之外的选择；这些包从不假设它。
- **只做 `memory_search` 工具**：仅有模型面工具会让召回变成模型每轮自行选择，丢掉驱动这次集成的自动跨会话连续性；推迟到出现需求。
- **在 `turn/end` 归档**：`agent/turn-stopping` 是轮次提交前最后一个由监听器持有的边界；在那里读日志不会与同轮更晚的追加竞争。
