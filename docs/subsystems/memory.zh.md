# Memory

[English](memory.md) | 中文

由 [`@deepseek-ai/dsh-memory`](../../packages/memory/memory/README.zh.md) 拥有的智能体记忆能力接缝：唯一的 provider 注册表（`ctx.memory`）配执行期 provider 选择，以及由 [`dsh-memory-tencentdb`](../../packages/memory/memory-tencentdb/README.zh.md) 实现、[`dsh-memory-session`](../../packages/memory/memory-session/README.zh.md) 驱动的 provider 无关 recall/record 词汇。所有包均为可选；默认组合一个也不挂载。

源码：[`packages/memory/memory/src/types.ts`](../../packages/memory/memory/src/types.ts)

## `MemoryProvider`：一个记忆后端

```ts type-equiv
/**
 * One memory backend behind `ctx.memory`. A provider is registered under its
 * `id` and must report honestly whether it can serve requests right now.
 */
interface MemoryProvider {
  /** Registry key and configuration-facing provider id. */
  readonly id: string
  /** Whether this provider can serve requests right now. */
  available(): boolean
  /**
   * Recall stored memory relevant to one query.
   * @param request - the query, isolation scope, and optional hit cap.
   * @param signal - optional cancellation signal; providers honor it best-effort.
   * @returns the recalled fragments, most relevant first.
   */
  recall(request: MemoryRecallRequest, signal?: AbortSignal): Promise<MemoryRecallResult>
  /**
   * Archive one finished conversation fragment.
   * @param request - the isolation scope and messages to store.
   * @param signal - optional cancellation signal; providers honor it best-effort.
   */
  record(request: MemoryRecordRequest, signal?: AbortSignal): Promise<void>
}
```

## 选择与词汇

选择与 web 接缝同构：配置的 provider id 必须已注册且可用；未配置时要求恰好一个可用 provider，因此选择从不依赖注册顺序。一次 recall 返回按层（`conversation` 或 `atomic`）标记、按 provider 得分降序排列的 `MemoryHit` 片段；接缝按请求的 limit 截断。一次 record 在调用会话的隔离键下归档一段完成的对话——带 ISO 时间戳的 `MemoryTurnMessage` 用户/助手消息对。失败抛出带稳定错误码体系（`MEMORY_PROVIDER_*`、`MEMORY_DUPLICATE_PROVIDER`）的 `MemoryError`。

## 会话消费者集成

`dsh-memory-session` 在每轮第一步通过 `agent/pre-step` waterfall 检索，把命中追加为一条持久的 `recall` 形态用户消息，因此注入的记忆与其他对话内容一样可持久化、可回放、可压缩——模型可见即可回放。归档在 `agent/turn-stopping` 边界读取持久日志，只写用户来源与助手消息。两条路径失败时都降级为日志警告；记忆绝不阻塞一轮。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxmemory--memoryruntime"></a>

### `ctx.memory` — `MemoryRuntime`

The agent-memory service. Registered as `ctx.memory` (one instance per context).

Selection semantics (resolved at execution time, never order-dependent):

- A configured id that is registered and `available()` → that provider.
- A configured id not registered → `MEMORY_PROVIDER_CONFIGURED_MISSING`.
- A configured id registered but unavailable → `MEMORY_PROVIDER_CONFIGURED_UNAVAILABLE`.
- No id configured, exactly one registered usable provider → that provider.
- No id configured, multiple usable providers → `MEMORY_PROVIDER_AMBIGUOUS`.
- No id configured, no usable provider → `MEMORY_PROVIDER_UNAVAILABLE`.

```ts cordis-catalog
/**
 * Register a memory provider. Throws {@link MemoryError}
 * `MEMORY_DUPLICATE_PROVIDER` if its id is already registered. Returns a
 * disposer; disposed with the calling fiber.
 * @param provider - the provider; its `id` is the registry key.
 * @returns the disposer that unregisters the provider.
 */
registerMemoryProvider(provider: MemoryProvider): () => void

/**
 * Recall stored memory relevant to one query through the selected provider.
 * Resolves the provider at call time with the selection rules above; throws
 * {@link MemoryError} when the capability cannot run. The seam enforces
 * `request.limit` on the result: if the provider over-returns, `hits[]` is
 * truncated.
 * @param request - the query, isolation scope, and optional hit cap.
 * @param signal - optional cancellation signal forwarded to the provider.
 * @returns the provider's fragments, capped to `request.limit`.
 */
async recall(request: MemoryRecallRequest, signal?: AbortSignal): Promise<MemoryRecallResult>

/**
 * Archive one finished conversation fragment through the selected provider.
 * Resolves the provider at call time with the selection rules above; throws
 * {@link MemoryError} when the capability cannot run.
 * @param request - the isolation scope and messages to store.
 * @param signal - optional cancellation signal forwarded to the provider.
 */
async record(request: MemoryRecordRequest, signal?: AbortSignal): Promise<void>
```

Source: [`packages/memory/memory/src/index.ts`](../../packages/memory/memory/src/index.ts)
<!-- END GENERATED cordis-surface -->
