/**
 * Service Definition for the agent-memory capability seam (`ctx.memory`): one
 * provider registry and provider-selecting execution for recall and record.
 * Duplicate ids are rejected. At execution time, a configured provider must
 * exist and be usable; without one, exactly one usable provider is required, so
 * selection never depends on registration order.
 * @module @deepseek-ai/dsh-memory
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {
  MemoryProvider,
  MemoryRecallRequest,
  MemoryRecallResult,
  MemoryRecordRequest,
} from './types.ts'
import { MemoryError } from './types.ts'

export { MemoryError } from './types.ts'
export type {
  MemoryHit,
  MemoryLayer,
  MemoryProvider,
  MemoryRecallRequest,
  MemoryRecallResult,
  MemoryRecordRequest,
  MemoryTurnMessage,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    memory: MemoryRuntime
  }
}

/** Selection inputs for execution-time provider resolution. */
interface Selection {
  /** The configured provider id, if any. */
  readonly configuredId?: string
  /** Providers registered for this capability. */
  readonly providers: ReadonlyMap<string, MemoryProvider>
}

/**
 * Config for the memory seam. `provider` pins which provider wins; it is
 * optional (a single registered usable provider auto-selects). Operational
 * overrides such as environment variables must feed this same field rather
 * than introduce a hidden priority chain.
 */
export interface MemoryRuntimeConfig {
  /** Explicit provider id. Omitted = auto-select when exactly one usable. */
  readonly provider?: string
}

/**
 * The agent-memory service. Registered as `ctx.memory` (one instance per
 * context).
 *
 * Selection semantics (resolved at execution time, never order-dependent):
 * - A configured id that is registered and `available()` → that provider.
 * - A configured id not registered → `MEMORY_PROVIDER_CONFIGURED_MISSING`.
 * - A configured id registered but unavailable →
 *   `MEMORY_PROVIDER_CONFIGURED_UNAVAILABLE`.
 * - No id configured, exactly one registered usable provider → that provider.
 * - No id configured, multiple usable providers → `MEMORY_PROVIDER_AMBIGUOUS`.
 * - No id configured, no usable provider → `MEMORY_PROVIDER_UNAVAILABLE`.
 */
export class MemoryRuntime extends Service {
  /**
   * Provider selection config. The operational env override
   * `$DSH_MEMORY_PROVIDER` is equivalent to `provider` and is NOT a hidden
   * priority chain.
   */
  static Config: z<MemoryRuntimeConfig> = z.object({
    provider: z.string(),
  })

  private providers = new Map<string, MemoryProvider>()
  private readonly providerId: string | undefined

  constructor(ctx: Context, config: MemoryRuntimeConfig = {}) {
    super(ctx, 'memory')
    this.providerId = config.provider ?? process.env.DSH_MEMORY_PROVIDER
  }

  /**
   * Register a memory provider. Throws {@link MemoryError}
   * `MEMORY_DUPLICATE_PROVIDER` if its id is already registered. Returns a
   * disposer; disposed with the calling fiber.
   * @param provider - the provider; its `id` is the registry key.
   * @returns the disposer that unregisters the provider.
   */
  registerMemoryProvider(provider: MemoryProvider): () => void {
    if (this.providers.has(provider.id)) {
      throw new MemoryError(`a memory provider with id "${provider.id}" is already registered`, 'MEMORY_DUPLICATE_PROVIDER')
    }
    const providers = this.providers
    const dispose = this.ctx.effect(function* () {
      providers.set(provider.id, provider)
      yield () => providers.delete(provider.id)
    }, 'memory.registerMemoryProvider()')
    // ctx.effect's disposer returns Promise<void>; our disposer API is
    // synchronous fire-and-forget — discard the (always-resolved) promise.
    return () => void dispose()
  }

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
  async recall(request: MemoryRecallRequest, signal?: AbortSignal): Promise<MemoryRecallResult> {
    const provider = this.resolveSelected()
    const result = await provider.recall(request, signal)
    return capHits(result, request.limit)
  }

  /**
   * Archive one finished conversation fragment through the selected provider.
   * Resolves the provider at call time with the selection rules above; throws
   * {@link MemoryError} when the capability cannot run.
   * @param request - the isolation scope and messages to store.
   * @param signal - optional cancellation signal forwarded to the provider.
   */
  async record(request: MemoryRecordRequest, signal?: AbortSignal): Promise<void> {
    const provider = this.resolveSelected()
    await provider.record(request, signal)
  }

  /** Resolve the provider for one call with the selection rules above. */
  private resolveSelected(): MemoryProvider {
    return resolveProvider({
      providers: this.providers,
      ...this.providerId !== undefined ? { configuredId: this.providerId } : {},
    })
  }
}

/** Resolve the selected provider or throw the matching {@link MemoryError}. */
function resolveProvider(selection: Selection): MemoryProvider {
  const { configuredId, providers } = selection
  if (configuredId !== undefined) {
    const provider = providers.get(configuredId)
    if (!provider) {
      throw new MemoryError(`configured memory provider "${configuredId}" is not registered`, 'MEMORY_PROVIDER_CONFIGURED_MISSING')
    }
    if (!provider.available()) {
      throw new MemoryError(`configured memory provider "${configuredId}" is registered but unavailable`, 'MEMORY_PROVIDER_CONFIGURED_UNAVAILABLE')
    }
    return provider
  }
  const usable = [...providers.values()].filter(provider => provider.available())
  const [single] = usable
  if (single === undefined) {
    throw new MemoryError('no usable memory provider is registered', 'MEMORY_PROVIDER_UNAVAILABLE')
  }
  if (usable.length > 1) {
    const ids = usable.map(provider => provider.id).join(', ')
    throw new MemoryError(`multiple usable memory providers are registered (${ids}); configure one explicitly`, 'MEMORY_PROVIDER_AMBIGUOUS')
  }
  return single
}

/** Enforce `limit` on a recall result: truncate `hits[]`. */
function capHits(result: MemoryRecallResult, limit: number | undefined): MemoryRecallResult {
  if (limit === undefined || result.hits.length <= limit) return result
  return { hits: result.hits.slice(0, limit) }
}

export default MemoryRuntime
