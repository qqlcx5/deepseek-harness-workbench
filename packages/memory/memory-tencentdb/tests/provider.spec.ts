import { describe, expect, it } from 'vitest'
import { MemoryClient, type Transport } from '@tencentdb-agent-memory/memory-sdk-ts-v2'
import type { MemoryRecordRequest } from '@deepseek-ai/dsh-memory'
import {
  TencentdbMemoryProvider,
  TENCENTDB_DEFAULT_LAYER_LIMIT,
} from '../src/provider.ts'

/** One recorded backend call: path plus the JSON body it carried. */
interface Call {
  readonly path: string
  readonly body: Record<string, unknown>
}

/** A Transport that records every call and answers from a script. */
function scriptedTransport(
  replies: (path: string) => unknown,
): { transport: Transport; calls: Call[] } {
  const calls: Call[] = []
  const transport: Transport = {
    async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
      calls.push({ path, body: body ?? {} })
      return replies(path) as T
    },
  }
  return { transport, calls }
}

const ISOLATION = { team_id: 'team-1', agent_id: 'agt-1', user_id: 'usr-1' }

/** A conversation-search reply shaped like the SDK's ConversationSearchData. */
const conversationReply = {
  messages: [
    { role: 'user', content: 'use pnpm here', score: 0.9, timestamp: '2026-01-02T00:00:00.000Z' },
    { role: 'assistant', content: 'noted', score: 0.5 },
  ],
}

/** An atomic-search reply shaped like the SDK's AtomicSearchData. */
const atomicReply = {
  items: [
    { id: 'a1', type: 'fact', content: 'repo uses pnpm workspaces', score: 0.8, created_at: 'x', updated_at: '2026-01-03T00:00:00.000Z' },
  ],
}

describe('TencentdbMemoryProvider recall', () => {
  it('merges conversation and atomic hits ranked by descending score', async () => {
    const { transport, calls } = scriptedTransport(path => path.endsWith('/conversation/search') ? conversationReply : atomicReply)
    const provider = new TencentdbMemoryProvider({ client: new MemoryClient(transport, ISOLATION) })

    const result = await provider.recall({ query: 'package manager', sessionId: 'sess-1' })

    expect(result.hits.map(hit => hit.text)).toEqual([
      'use pnpm here',
      'repo uses pnpm workspaces',
      'noted',
    ])
    expect(result.hits[0]).toMatchObject({ layer: 'conversation', role: 'user', timestamp: '2026-01-02T00:00:00.000Z' })
    expect(result.hits[1]).toMatchObject({ layer: 'atomic' })
    for (const call of calls) {
      expect(call.body).toMatchObject({ ...ISOLATION, session_id: 'sess-1' })
    }
  })

  it('requests the configured layer limit from both layers', async () => {
    const { transport, calls } = scriptedTransport(() => ({ messages: [], items: [] }))
    const provider = new TencentdbMemoryProvider({ client: new MemoryClient(transport, ISOLATION), layerLimit: 3 })

    await provider.recall({ query: 'q', sessionId: 'sess-1' })

    expect(calls.map(call => call.body.limit)).toEqual([3, 3])
  })

  it('defaults the layer limit to TENCENTDB_DEFAULT_LAYER_LIMIT', async () => {
    const { transport, calls } = scriptedTransport(() => ({ messages: [], items: [] }))
    const provider = new TencentdbMemoryProvider({ client: new MemoryClient(transport, ISOLATION) })

    await provider.recall({ query: 'q', sessionId: 'sess-1' })

    expect(calls.map(call => call.body.limit)).toEqual([TENCENTDB_DEFAULT_LAYER_LIMIT, TENCENTDB_DEFAULT_LAYER_LIMIT])
  })

  it('rejects with the abort reason when the signal is already aborted', async () => {
    const { transport, calls } = scriptedTransport(() => ({ messages: [], items: [] }))
    const provider = new TencentdbMemoryProvider({ client: new MemoryClient(transport, ISOLATION) })
    const controller = new AbortController()
    controller.abort('halted')

    await expect(provider.recall({ query: 'q', sessionId: 'sess-1' }, controller.signal)).rejects.toBe('halted')
    expect(calls).toHaveLength(0)
  })
})

describe('TencentdbMemoryProvider record', () => {
  it('archives the messages under the request session scope', async () => {
    const { transport, calls } = scriptedTransport(() => ({ accepted_ids: ['m1'], total_count: 1 }))
    const provider = new TencentdbMemoryProvider({ client: new MemoryClient(transport, ISOLATION) })
    const request: MemoryRecordRequest = {
      sessionId: 'sess-9',
      messages: [
        { role: 'user', content: 'hello', timestamp: '2026-01-01T00:00:00.000Z' },
        { role: 'assistant', content: 'hi', timestamp: '2026-01-01T00:00:01.000Z' },
      ],
    }

    await expect(provider.record(request)).resolves.toBeUndefined()
    expect(calls).toEqual([{
      path: '/v3/conversation/add',
      body: {
        ...ISOLATION,
        session_id: 'sess-9',
        messages: request.messages,
      },
    }])
  })

  it('rejects when the signal is already aborted without calling the backend', async () => {
    const { transport, calls } = scriptedTransport(() => ({ accepted_ids: [], total_count: 0 }))
    const provider = new TencentdbMemoryProvider({ client: new MemoryClient(transport, ISOLATION) })
    const controller = new AbortController()
    controller.abort('halted')

    await expect(provider.record({ sessionId: 's', messages: [] }, controller.signal)).rejects.toBe('halted')
    expect(calls).toHaveLength(0)
  })
})

describe('TencentdbMemoryProvider availability', () => {
  it('reports available by construction', () => {
    const { transport } = scriptedTransport(() => ({}))
    const provider = new TencentdbMemoryProvider({ client: new MemoryClient(transport, ISOLATION) })
    expect(provider.id).toBe('tencentdb')
    expect(provider.available()).toBe(true)
  })
})
