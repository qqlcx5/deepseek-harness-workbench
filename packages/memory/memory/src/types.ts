/**
 * Provider-agnostic vocabulary for the memory capability seam: one recall
 * request/result pair, one record request, and the provider interface.
 *
 * @module @deepseek-ai/dsh-memory
 */

/** Error taxonomy for the memory seam. Codes mirror the web seam's shape. */
export class MemoryError extends Error {
  /** Stable machine-readable code. */
  readonly code: string

  /**
   * @param message - human-readable diagnosis.
   * @param code - stable code from the seam's taxonomy.
   */
  constructor(message: string, code: string) {
    super(message)
    this.name = 'MemoryError'
    this.code = code
  }
}

/** The memory layer a hit was recalled from. */
export type MemoryLayer = 'conversation' | 'atomic'

/** One recalled memory fragment. */
export interface MemoryHit {
  /** The layer the fragment was recalled from. */
  readonly layer: MemoryLayer
  /** The provider's relevance score; higher is more relevant. */
  readonly score: number
  /** The fragment's model-facing text. */
  readonly text: string
  /** The fragment's speaker; conversation-layer hits only. */
  readonly role?: 'user' | 'assistant'
  /** The fragment's creation time, ISO-8601, when the provider knows it. */
  readonly timestamp?: string
}

/** One recall (search) request against stored memory. */
export interface MemoryRecallRequest {
  /** The query text to recall memory for. */
  readonly query: string
  /** The session whose isolation scope the recall reads. */
  readonly sessionId: string
  /** Upper bound on returned hits. Omitted = provider default. */
  readonly limit?: number
}

/** The result of one recall request. */
export interface MemoryRecallResult {
  /** The recalled fragments, most relevant first. */
  readonly hits: readonly MemoryHit[]
}

/** One message of a conversation being recorded. */
export interface MemoryTurnMessage {
  /** The speaker. */
  readonly role: 'user' | 'assistant'
  /** The message's text content. */
  readonly content: string
  /** The message's time, ISO-8601. */
  readonly timestamp: string
}

/** One record (archive) request of a finished conversation fragment. */
export interface MemoryRecordRequest {
  /** The session whose isolation scope the record writes. */
  readonly sessionId: string
  /** The messages to archive, in conversation order. */
  readonly messages: readonly MemoryTurnMessage[]
}

/**
 * One memory backend behind `ctx.memory`. A provider is registered under its
 * `id` and must report honestly whether it can serve requests right now.
 */
export interface MemoryProvider {
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
