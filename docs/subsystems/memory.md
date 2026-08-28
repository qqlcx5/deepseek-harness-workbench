# Memory

English | [中文](memory.zh.md)

The agent-memory capability seam owned by [`@deepseek-ai/dsh-memory`](../../packages/memory/memory/README.md): one provider registry (`ctx.memory`) with execution-time provider selection, plus the provider-agnostic recall/record vocabulary that [`dsh-memory-tencentdb`](../../packages/memory/memory-tencentdb/README.md) implements and [`dsh-memory-session`](../../packages/memory/memory-session/README.md) drives. All packages are opt-in; default compositions mount none of them.

Source: [`packages/memory/memory/src/types.ts`](../../packages/memory/memory/src/types.ts)

## `MemoryProvider` — one memory backend

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

## Selection and vocabulary

Selection mirrors the web seam: a configured provider id must be registered and usable, and without one exactly one usable provider is required, so selection never depends on registration order. A recall returns `MemoryHit` fragments tagged by layer (`conversation` or `atomic`) and ranked by descending provider score; the seam truncates to the request's limit. A record archives one finished conversation fragment — `MemoryTurnMessage` user/assistant pairs with ISO timestamps — under the calling session's isolation key. Failures throw `MemoryError` with a stable code taxonomy (`MEMORY_PROVIDER_*`, `MEMORY_DUPLICATE_PROVIDER`).

## Session consumer integration

`dsh-memory-session` recalls at each turn's first step through the `agent/pre-step` waterfall and appends the hits as one durable `recall`-form user message, so injected memory persists, replays, and compacts like other conversation content — model-visible means logged. Archival runs at the `agent/turn-stopping` boundary over the durable log and writes only user-sourced and assistant messages. Both paths degrade to a log warning; memory never blocks a turn.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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
