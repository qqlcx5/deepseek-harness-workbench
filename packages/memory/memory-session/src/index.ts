/**
 * Per-session memory consumer for the `ctx.memory` seam. At each turn's first
 * step it recalls stored memory for the claimed user text and appends the
 * hits as one durable, source-attributed recall message; when a turn stops it
 * archives the turn's user/assistant messages. Both paths degrade to a log
 * warning when the memory seam fails — memory never blocks a turn.
 *
 * @module @deepseek-ai/dsh-memory-session
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, UserMessage } from '@deepseek-ai/dsh-llm'
import type { MemoryHit, MemoryTurnMessage } from '@deepseek-ai/dsh-memory'
import type { Session } from '@deepseek-ai/dsh-session'

/** Cordis plugin name used by loader diagnostics and message sources. */
export const name = 'memory-session'

/** The memory seam plus the agent registry that owns pre-step processing. */
export const inject = ['agents', 'memory']

/** Default cap on hits recalled into one turn. */
export const DEFAULT_RECALL_MAX_HITS = 8

/** Plugin config: recall/archive toggles and the recall hit cap. */
export interface Config {
  /** Recall stored memory into each turn's first step. Defaults to true. */
  recall?: boolean
  /** Archive each finished turn's user/assistant messages. Defaults to true. */
  archive?: boolean
  /** Upper bound on hits recalled into one turn. Defaults to 8. */
  maxHits?: number
}

export const Config: z<Config> = z.object({
  recall: z.boolean().default(true),
  archive: z.boolean().default(true),
  maxHits: z.number().step(1).min(1).default(DEFAULT_RECALL_MAX_HITS),
})

/** Complete config after schemastery applies every field default. */
type ResolvedConfig = Required<Config>

/** Join the text blocks of one message's content. */
function textOf(content: readonly ContentBlock[]): string {
  const texts: string[] = []
  for (const block of content) {
    if (block.type === 'text') texts.push(block.text)
  }
  return texts.join('\n')
}

/**
 * Render recalled hits as the model-facing recall text. The leading sentence
 * is a stable literal; each hit contributes one bullet with its layer and,
 * when known, its timestamp.
 * @param hits - the capped hit list, most relevant first.
 * @returns the rendered text with one bullet per hit.
 */
export function renderRecallText(hits: readonly MemoryHit[]): string {
  const lines = hits.map((hit) => {
    const meta = hit.timestamp === undefined ? hit.layer : `${hit.layer}, ${hit.timestamp}`
    return `- (${meta}) ${hit.text}`
  })
  return `Recalled memory relevant to this turn:\n${lines.join('\n')}`
}

/** Collect the closing turn's archived messages from the session log. */
function archivedMessages(session: Session, turn: number): MemoryTurnMessage[] {
  const start = session.events.findLastIndex(
    event => event.type === 'turn/start' && event.data.turn === turn,
  )
  if (start < 0) return []
  const messages: MemoryTurnMessage[] = []
  for (const event of session.events.slice(start + 1)) {
    switch (event.type) {
      case 'user/message':
        // Plugin-sourced context is re-injectable, not conversation; archive
        // only user-sourced text.
        if (event.data.source.kind !== 'user') break
        messages.push({
          role: 'user',
          content: textOf(event.data.content),
          timestamp: new Date(event.time).toISOString(),
        })
        break
      case 'assistant/message':
        messages.push({
          role: 'assistant',
          content: textOf(event.data.message.content),
          timestamp: new Date(event.time).toISOString(),
        })
        break
      default:
        // Merge-extensible session events: other records are not conversation.
        break
    }
  }
  return messages.filter(message => message.content.length > 0)
}

/** Extract the recall query from the messages claimed for one step. */
function recallQuery(messages: readonly UserMessage[]): string {
  return messages
    .map(message => textOf(message.content))
    .filter(text => text.length > 0)
    .join('\n')
}

/**
 * Register the recall and archive listeners for the lifetime of `ctx`.
 * @param ctx - plugin context; the listeners are disposed with it.
 * @param config - recall/archive toggles and the recall hit cap; schemastery
 *   rejects a `maxHits` that is not a positive integer at load.
 */
export function apply(ctx: Context, config: Config): void {
  // schemastery (Config) has already filled and validated every field.
  const resolved = config as ResolvedConfig

  if (resolved.recall) {
    ctx.on('agent/pre-step', async (
      { agent, messages, turn, step, signal },
      next,
    ): Promise<PreStepDecision> => {
      const decision = await next()
      if (decision.kind === 'reject' || signal.aborted) return decision
      // Recall once per turn: later steps continue the same conversation.
      if (step !== 1) return decision
      const query = recallQuery(messages)
      if (query.length === 0) return decision
      let hits: readonly MemoryHit[]
      try {
        const result = await ctx.memory.recall({
          query,
          sessionId: agent.session.id,
          limit: resolved.maxHits,
        }, signal)
        hits = result.hits
      } catch (error: unknown) {
        ctx.logger.warn(`memory-session: recall failed for turn ${String(turn)}: ${String(error)}`)
        return decision
      }
      if (hits.length === 0) return decision
      const text = renderRecallText(hits)
      return {
        ...decision,
        messages: [
          ...decision.messages,
          createUserMessage({
            content: [{ type: 'text', text }],
            source: { kind: 'plugin', plugin: name, form: 'recall' },
          }),
        ],
      }
    }, { prepend: true })
  }

  if (resolved.archive) {
    ctx.on('agent/turn-stopping', ({ agent, turn }): void => {
      const messages = archivedMessages(agent.session, turn)
      if (messages.length === 0) return
      // Archival must not delay the turn boundary; failures surface as logs.
      void ctx.memory.record({ sessionId: agent.session.id, messages })
        .catch((error: unknown) => {
          ctx.logger.warn(`memory-session: archiving turn ${String(turn)} failed: ${String(error)}`)
        })
    })
  }
}
