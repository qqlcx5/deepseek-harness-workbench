/**
 * TencentDB Agent Memory `MemoryProvider`: L0 conversation search plus L1
 * atomic search merged into one ranked hit list, and L0 conversation archival,
 * against a MemoryCore v3 strict-isolation endpoint.
 *
 * @module @deepseek-ai/dsh-memory-tencentdb
 */

import type { MemoryClient } from '@tencentdb-agent-memory/memory-sdk-ts-v2'
import type {
  MemoryHit,
  MemoryProvider,
  MemoryRecallRequest,
  MemoryRecallResult,
  MemoryRecordRequest,
} from '@deepseek-ai/dsh-memory'

/** Registry id of the provider this package registers. */
export const TENCENTDB_MEMORY_PROVIDER_ID = 'tencentdb'

/** Default per-layer hit count requested from each backend search. */
export const TENCENTDB_DEFAULT_LAYER_LIMIT = 8

/** Options for {@link TencentdbMemoryProvider}. */
export interface TencentdbMemoryProviderOptions {
  /** A base MemoryCore v3 client; the provider derives per-session isolation views from it. */
  readonly client: MemoryClient
  /** Per-layer hit count requested from each backend search. Defaults to 8. */
  readonly layerLimit?: number
}

/**
 * The TencentDB Agent Memory provider. `available()` is always true: the
 * plugin refuses to register the provider unless its identity fields are all
 * present, so a registered instance is configured by construction.
 */
export class TencentdbMemoryProvider implements MemoryProvider {
  readonly id = TENCENTDB_MEMORY_PROVIDER_ID

  private readonly client: MemoryClient
  private readonly layerLimit: number

  constructor(options: TencentdbMemoryProviderOptions) {
    this.client = options.client
    this.layerLimit = options.layerLimit ?? TENCENTDB_DEFAULT_LAYER_LIMIT
  }

  available(): boolean {
    return true
  }

  /**
   * Recall L0 conversation and L1 atomic hits for one query, merged and ranked
   * by descending score. The per-layer request size is the configured
   * `layerLimit`; the seam caps the merged list to `request.limit`.
   * @param request - the query and isolation scope.
   * @param signal - checked before each backend call; the SDK transport itself honors only its configured timeout.
   * @returns the merged hits, most relevant first.
   */
  async recall(request: MemoryRecallRequest, signal?: AbortSignal): Promise<MemoryRecallResult> {
    const scoped = this.client.withIsolation({ sessionId: request.sessionId })
    signal?.throwIfAborted()
    const [conversations, atomics] = await Promise.all([
      scoped.searchConversation({ query: request.query, limit: this.layerLimit }),
      scoped.searchAtomic({ query: request.query, limit: this.layerLimit }),
    ])
    const hits: MemoryHit[] = [
      ...conversations.messages.map(message => ({
        layer: 'conversation' as const,
        score: message.score,
        text: message.content,
        role: message.role === 'assistant' ? 'assistant' as const : 'user' as const,
        ...message.timestamp !== undefined ? { timestamp: message.timestamp } : {},
      })),
      ...atomics.items.map(item => ({
        layer: 'atomic' as const,
        score: item.score,
        text: item.content,
        timestamp: item.updated_at,
      })),
    ]
    hits.sort((a, b) => b.score - a.score)
    return { hits }
  }

  /**
   * Archive one finished conversation fragment as L0 messages under the
   * request's session scope.
   * @param request - the isolation scope and messages to store.
   * @param signal - checked before the backend call; the SDK transport itself honors only its configured timeout.
   */
  async record(request: MemoryRecordRequest, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    await this.client.withIsolation({ sessionId: request.sessionId }).addConversation({
      messages: request.messages.map(message => ({
        role: message.role,
        content: message.content,
        timestamp: message.timestamp,
      })),
    })
  }
}
