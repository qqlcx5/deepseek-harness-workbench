import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import MemoryRuntime, {
  MemoryError,
  type MemoryHit,
  type MemoryProvider,
  type MemoryRecallRequest,
  type MemoryRecallResult,
  type MemoryRecordRequest,
} from '@deepseek-ai/dsh-memory'

/** A scripted provider for contract tests. */
function makeProvider(
  id: string,
  available: boolean,
  recall: (request: MemoryRecallRequest, signal?: AbortSignal) => Promise<MemoryRecallResult>,
  record: (request: MemoryRecordRequest) => Promise<void>,
): MemoryProvider {
  return { id, available: () => available, recall: (request, signal) => recall(request, signal), record: request => record(request) }
}

function hit(layer: MemoryHit['layer'], score: number, text: string): MemoryHit {
  return { layer, score, text }
}

const available = true
const unavailable = false

const emptyRecall = (): Promise<MemoryRecallResult> => Promise.resolve({ hits: [] })

/** Mount a MemoryRuntime on a fresh root context with the given config. */
async function mountMemory(config: ConstructorParameters<typeof MemoryRuntime>[1] = {}): Promise<{ ctx: Context; memory: MemoryRuntime }> {
  const ctx = new Context()
  await ctx.plugin(MemoryRuntime, config)
  return { ctx, memory: ctx.memory }
}

describe('MemoryRuntime registration', () => {
  it('registers a provider and unregisters it via the returned disposer', async () => {
    const { memory } = await mountMemory()

    const dispose = memory.registerMemoryProvider(makeProvider('tencentdb', available, () => Promise.resolve({ hits: [hit('atomic', 1, 'a')] }), () => Promise.resolve()))
    await expect(memory.recall({ query: 'q', sessionId: 's' })).resolves.toMatchObject({ hits: [{ text: 'a' }] })

    dispose()
    await expect(memory.recall({ query: 'q', sessionId: 's' })).rejects.toThrow(expect.objectContaining({ code: 'MEMORY_PROVIDER_UNAVAILABLE' }))
  })

  it('throws MEMORY_DUPLICATE_PROVIDER on a duplicate id', async () => {
    const { memory } = await mountMemory()
    memory.registerMemoryProvider(makeProvider('tencentdb', available, emptyRecall, () => Promise.resolve()))
    expect(() => memory.registerMemoryProvider(makeProvider('tencentdb', available, emptyRecall, () => Promise.resolve())))
      .toThrow(expect.objectContaining({ code: 'MEMORY_DUPLICATE_PROVIDER' }))
  })

  it('forwards the cancellation signal to the provider', async () => {
    const { memory } = await mountMemory()
    const signals: (AbortSignal | undefined)[] = []
    memory.registerMemoryProvider(makeProvider('tencentdb', available, (_request, signal) => {
      signals.push(signal)
      return emptyRecall()
    }, () => Promise.resolve()))
    const signal = new AbortController().signal
    await memory.recall({ query: 'q', sessionId: 's' }, signal)
    expect(signals).toEqual([signal])
  })
})

describe('MemoryRuntime selection', () => {
  it('uses the configured id when it is registered and usable', async () => {
    const { memory } = await mountMemory({ provider: 'b' })
    memory.registerMemoryProvider(makeProvider('a', available, () => Promise.resolve({ hits: [hit('atomic', 1, 'a')] }), () => Promise.resolve()))
    memory.registerMemoryProvider(makeProvider('b', available, () => Promise.resolve({ hits: [hit('atomic', 1, 'b')] }), () => Promise.resolve()))
    await expect(memory.recall({ query: 'q', sessionId: 's' })).resolves.toMatchObject({ hits: [{ text: 'b' }] })
  })

  it('throws MEMORY_PROVIDER_CONFIGURED_MISSING for an unregistered configured id', async () => {
    const { memory } = await mountMemory({ provider: 'ghost' })
    memory.registerMemoryProvider(makeProvider('a', available, emptyRecall, () => Promise.resolve()))
    await expect(memory.recall({ query: 'q', sessionId: 's' })).rejects.toThrow(expect.objectContaining({ code: 'MEMORY_PROVIDER_CONFIGURED_MISSING' }))
  })

  it('throws MEMORY_PROVIDER_CONFIGURED_UNAVAILABLE for a configured but unavailable id', async () => {
    const { memory } = await mountMemory({ provider: 'a' })
    memory.registerMemoryProvider(makeProvider('a', unavailable, emptyRecall, () => Promise.resolve()))
    await expect(memory.recall({ query: 'q', sessionId: 's' })).rejects.toThrow(expect.objectContaining({ code: 'MEMORY_PROVIDER_CONFIGURED_UNAVAILABLE' }))
  })

  it('auto-selects the single usable provider', async () => {
    const { memory } = await mountMemory()
    memory.registerMemoryProvider(makeProvider('a', unavailable, emptyRecall, () => Promise.resolve()))
    memory.registerMemoryProvider(makeProvider('b', available, () => Promise.resolve({ hits: [hit('atomic', 1, 'b')] }), () => Promise.resolve()))
    await expect(memory.recall({ query: 'q', sessionId: 's' })).resolves.toMatchObject({ hits: [{ text: 'b' }] })
  })

  it('throws MEMORY_PROVIDER_AMBIGUOUS for multiple usable providers', async () => {
    const { memory } = await mountMemory()
    memory.registerMemoryProvider(makeProvider('a', available, emptyRecall, () => Promise.resolve()))
    memory.registerMemoryProvider(makeProvider('b', available, emptyRecall, () => Promise.resolve()))
    await expect(memory.recall({ query: 'q', sessionId: 's' })).rejects.toThrow(expect.objectContaining({ code: 'MEMORY_PROVIDER_AMBIGUOUS' }))
  })

  it('throws MEMORY_PROVIDER_UNAVAILABLE with no usable provider', async () => {
    const { memory } = await mountMemory()
    await expect(memory.recall({ query: 'q', sessionId: 's' })).rejects.toThrow(expect.objectContaining({ code: 'MEMORY_PROVIDER_UNAVAILABLE' }))
    await expect(memory.record({ sessionId: 's', messages: [] })).rejects.toThrow(MemoryError)
  })
})

describe('MemoryRuntime caps recall to the request limit', () => {
  it('truncates over-returned hits', async () => {
    const { memory } = await mountMemory()
    memory.registerMemoryProvider(makeProvider('a', available, () => Promise.resolve({
      hits: [hit('atomic', 3, 'c'), hit('atomic', 2, 'b'), hit('atomic', 1, 'a')],
    }), () => Promise.resolve()))
    await expect(memory.recall({ query: 'q', sessionId: 's', limit: 2 })).resolves.toMatchObject({
      hits: [{ text: 'c' }, { text: 'b' }],
    })
  })

  it('keeps a result already within the limit', async () => {
    const { memory } = await mountMemory()
    const within = { hits: [hit('atomic', 1, 'a')] }
    memory.registerMemoryProvider(makeProvider('a', available, () => Promise.resolve(within), () => Promise.resolve()))
    await expect(memory.recall({ query: 'q', sessionId: 's', limit: 5 })).resolves.toBe(within)
  })
})

describe('MemoryRuntime record', () => {
  it('delegates record to the selected provider', async () => {
    const { memory } = await mountMemory()
    const recorded: MemoryRecordRequest[] = []
    memory.registerMemoryProvider(makeProvider('a', available, emptyRecall, (request) => {
      recorded.push(request)
      return Promise.resolve()
    }))
    const request: MemoryRecordRequest = {
      sessionId: 's',
      messages: [{ role: 'user', content: 'hello', timestamp: '2026-01-01T00:00:00.000Z' }],
    }
    await expect(memory.record(request)).resolves.toBeUndefined()
    expect(recorded).toEqual([request])
  })
})
