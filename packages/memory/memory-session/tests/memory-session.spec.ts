import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import MemoryRuntime, { type MemoryProvider, type MemoryRecordRequest, type MemoryRecallRequest } from '@deepseek-ai/dsh-memory'
import { createUserMessage, createAssistantMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import AgentRegistry, { agentEvents, Inbox, type Agent } from '@deepseek-ai/dsh-agent'
import * as memorySession from '../src/index.ts'
import { renderRecallText } from '../src/index.ts'

const SIGNAL = new AbortController().signal

/** A scripted memory provider wired into a mounted MemoryRuntime. */
interface MemoryHarness {
  readonly ctx: Context
  readonly recalls: MemoryRecallRequest[]
  recallResult: { hits: { layer: 'conversation'; score: number; text: string }[] }
  recallError: Error | undefined
  readonly records: MemoryRecordRequest[]
  recordError: Error | undefined
  readonly warns: string[]
}

async function mount(config: memorySession.Config = {}): Promise<MemoryHarness> {
  const ctx = new Context()
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(MemoryRuntime)
  const harness: MemoryHarness = {
    ctx,
    recalls: [],
    recallResult: { hits: [{ layer: 'conversation', score: 0.9, text: 'repo uses pnpm' }] },
    recallError: undefined,
    records: [],
    recordError: undefined,
    warns: [],
  }
  const provider: MemoryProvider = {
    id: 'scripted',
    available: () => true,
    recall: (request) => {
      harness.recalls.push(request)
      if (harness.recallError !== undefined) return Promise.reject(harness.recallError)
      return Promise.resolve(harness.recallResult)
    },
    record: (request) => {
      harness.records.push(request)
      if (harness.recordError !== undefined) return Promise.reject(harness.recordError)
      return Promise.resolve()
    },
  }
  ctx.memory.registerMemoryProvider(provider)
  vi.spyOn(ctx.logger, 'warn').mockImplementation((...args: unknown[]) => {
    harness.warns.push(args.map(String).join(' '))
  })
  await ctx.plugin(memorySession, config)
  return harness
}

function sessionAgent(session: Session, id = 'agent'): Agent {
  return {
    id: SessionId(id),
    options: {},
    session,
    inbox: new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} }),
    status: 'running',
    ctx: new Context(),
    send: () => {},
    followup: () => {},
    steer: () => {},
    inject: () => {},
    cancel() {},
    runMaintenance: task => task(SIGNAL),
    whenIdle: () => Promise.resolve(),
  }
}

/** Open a turn and enter its user message, mirroring the loop's step opening. */
function openTurn(session: Session, turn: number, text: string): void {
  session.append('turn/start', { turn })
  session.append('user/message', createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  }), { surfaceOp: 'append' })
}

/** Fire the pre-step waterfall and append any injected messages, like the loop. */
async function fireStep(harness: MemoryHarness, agent: Agent, turn: number, step: number, text = 'request proposal'): Promise<number> {
  const proposed = createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  })
  const decision = await agentEvents(harness.ctx, agent).waterfall(
    'agent/pre-step',
    { messages: [proposed], turn, step, signal: SIGNAL },
    () => Promise.resolve({ kind: 'enter' as const, messages: [proposed] }),
  )
  if (decision.kind !== 'enter') return 0
  for (const message of decision.messages) {
    if (message === proposed) continue
    agent.session.append('user/message', message, { surfaceOp: 'append' })
  }
  return decision.messages.length
}

function assistantMessage(text: string) {
  return createAssistantMessage({
    content: [{ type: 'text', text }],
    source: { provider: 'mock', model: 'mock-1' },
  })
}

/** Close a turn through the serial stopping boundary, like the loop. */
async function stopTurn(harness: MemoryHarness, agent: Agent, turn: number): Promise<void> {
  await agentEvents(harness.ctx, agent).serial('agent/turn-stopping', { turn, signal: SIGNAL })
  sessionAppendTurnEnd(agent, turn)
}

function sessionAppendTurnEnd(agent: Agent, turn: number): void {
  agent.session.append('turn/end', { turn, reason: { kind: 'completed' } })
}

function injectedTexts(session: Session): string[] {
  const texts: string[] = []
  for (const event of session.events) {
    if (event.type === 'user/message'
      && event.data.source.kind === 'plugin'
      && event.data.source.plugin === 'memory-session') {
      texts.push(event.data.content.find(block => block.type === 'text')?.text ?? '')
    }
  }
  return texts
}

describe('memory-session recall injection', () => {
  it('appends one durable recall message at the turn first step', async () => {
    const harness = await mount()
    const session = Session.create(SessionId('inject'))
    openTurn(session, 1, 'how do I install deps?')

    const appended = await fireStep(harness, sessionAgent(session), 1, 1)

    expect(appended).toBe(2)
    expect(injectedTexts(session)).toEqual([renderRecallText(harness.recallResult.hits)])
    const event = session.events.at(-1)
    expect(event?.type).toBe('user/message')
    if (event?.type !== 'user/message') throw new Error('missing recall message')
    expect(event.data.source).toEqual({ kind: 'plugin', plugin: 'memory-session', form: 'recall' })
    expect(event.surfaceOp).toBe('append')
    expect(harness.recalls).toEqual([{
      query: 'request proposal',
      sessionId: 'inject',
      limit: 8,
    }])
  })

  it('skips recall at later steps of the same turn', async () => {
    const harness = await mount()
    const session = Session.create(SessionId('later-step'))
    openTurn(session, 1, 'q')

    await fireStep(harness, sessionAgent(session), 1, 1)
    await fireStep(harness, sessionAgent(session), 1, 2)

    expect(harness.recalls).toHaveLength(1)
  })

  it('injects nothing when recall returns no hits', async () => {
    const harness = await mount()
    harness.recallResult = { hits: [] }
    const session = Session.create(SessionId('empty'))
    openTurn(session, 1, 'q')

    const appended = await fireStep(harness, sessionAgent(session), 1, 1)

    expect(appended).toBe(1)
    expect(injectedTexts(session)).toEqual([])
  })

  it('degrades to a warning when recall fails', async () => {
    const harness = await mount()
    harness.recallError = new Error('endpoint down')
    const session = Session.create(SessionId('failing'))
    openTurn(session, 1, 'q')

    const appended = await fireStep(harness, sessionAgent(session), 1, 1)

    expect(appended).toBe(1)
    expect(injectedTexts(session)).toEqual([])
    expect(harness.warns.join('\n')).toContain('memory-session: recall failed')
  })

  it('does not recall a rejected step', async () => {
    const harness = await mount()
    const session = Session.create(SessionId('rejected'))
    const agent = sessionAgent(session)
    const proposed = createUserMessage({
      content: [{ type: 'text', text: 'nope' }],
      source: { kind: 'user' },
    })
    const decision = await agentEvents(harness.ctx, agent).waterfall(
      'agent/pre-step',
      { messages: [proposed], turn: 1, step: 1, signal: SIGNAL },
      () => Promise.resolve({ kind: 'reject' as const }),
    )
    expect(decision.kind).toBe('reject')
    expect(harness.recalls).toHaveLength(0)
  })

  it('does not recall a claim with no text', async () => {
    const harness = await mount()
    const session = Session.create(SessionId('textless'))
    const agent = sessionAgent(session)
    const proposed = createUserMessage({
      content: [{ type: 'reasoning', text: 'internal deliberation' }],
      source: { kind: 'user' },
    })
    await agentEvents(harness.ctx, agent).waterfall(
      'agent/pre-step',
      { messages: [proposed], turn: 1, step: 1, signal: SIGNAL },
      () => Promise.resolve({ kind: 'enter' as const, messages: [proposed] }),
    )
    expect(harness.recalls).toHaveLength(0)
  })

  it('passes the configured hit cap as the recall limit', async () => {
    const harness = await mount({ maxHits: 3 })
    const session = Session.create(SessionId('capped'))
    openTurn(session, 1, 'q')

    await fireStep(harness, sessionAgent(session), 1, 1)

    expect(harness.recalls[0]?.limit).toBe(3)
  })
})

describe('memory-session archival', () => {
  it('archives the turn user and assistant messages, excluding plugin context', async () => {
    const harness = await mount()
    const session = Session.create(SessionId('archive'))
    const agent = sessionAgent(session)
    session.append('turn/start', { turn: 1 })
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'how do I install deps?' }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    session.append('assistant/message', {
      turn: 1,
      step: 1,
      message: assistantMessage('use pnpm install'),
    }, { surfaceOp: 'append' })
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'recalled context' }],
      source: { kind: 'plugin', plugin: 'memory-session', form: 'recall' },
    }), { surfaceOp: 'append' })

    await stopTurn(harness, agent, 1)

    await vi.waitFor(() =>{  expect(harness.records).toHaveLength(1) })
    const [recorded] = harness.records
    if (recorded === undefined) throw new Error('missing record')
    expect(recorded.sessionId).toBe('archive')
    expect(recorded.messages.map(message => [message.role, message.content])).toEqual([
      ['user', 'how do I install deps?'],
      ['assistant', 'use pnpm install'],
    ])
    for (const message of recorded.messages) {
      expect(message.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    }
  })

  it('does not record a turn with no conversation messages', async () => {
    const harness = await mount()
    const session = Session.create(SessionId('empty-turn'))
    const agent = sessionAgent(session)
    session.append('turn/start', { turn: 1 })

    await stopTurn(harness, agent, 1)

    await new Promise(resolve => setTimeout(resolve, 10))
    expect(harness.records).toHaveLength(0)
  })

  it('degrades to a warning when recording fails', async () => {
    const harness = await mount()
    harness.recordError = new Error('write rejected')
    const session = Session.create(SessionId('failing-record'))
    const agent = sessionAgent(session)
    session.append('turn/start', { turn: 1 })
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'q' }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })

    await stopTurn(harness, agent, 1)

    await vi.waitFor(() =>{  expect(harness.warns.join('\n')).toContain('memory-session: archiving turn 1 failed') })
  })

  it('ignores non-conversation events inside the turn', async () => {
    const harness = await mount()
    const session = Session.create(SessionId('mixed-events'))
    const agent = sessionAgent(session)
    session.append('turn/start', { turn: 1 })
    session.append('step/start', { turn: 1, step: 1 })
    session.append('step/end', { turn: 1, step: 1 })
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'q' }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })

    await stopTurn(harness, agent, 1)

    await vi.waitFor(() =>{  expect(harness.records).toHaveLength(1) })
    expect(harness.records[0]?.messages.map(message => message.role)).toEqual(['user'])
  })

  it('does not record a turn that never opened', async () => {
    const harness = await mount()
    const session = Session.create(SessionId('unopened-turn'))
    const agent = sessionAgent(session)
    session.append('turn/start', { turn: 1 })

    await stopTurn(harness, agent, 2)

    await new Promise(resolve => setTimeout(resolve, 10))
    expect(harness.records).toHaveLength(0)
  })
})

describe('memory-session configuration', () => {
  it('registers no listeners when both paths are disabled', async () => {
    const harness = await mount({ recall: false, archive: false })
    const session = Session.create(SessionId('off'))
    const agent = sessionAgent(session)
    openTurn(session, 1, 'q')

    await fireStep(harness, agent, 1, 1)
    await stopTurn(harness, agent, 1)

    expect(harness.recalls).toHaveLength(0)
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(harness.records).toHaveLength(0)
  })

  it('rejects a non-positive hit cap at load', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(MemoryRuntime)
    ctx.memory.registerMemoryProvider({
      id: 'x',
      available: () => true,
      recall: () => Promise.resolve({ hits: [] }),
      record: () => Promise.resolve(),
    })
    await expect(ctx.plugin(memorySession, { maxHits: 0 })).rejects.toThrow('$.maxHits expected number >= 1')
  })
})

describe('renderRecallText', () => {
  it('renders one bullet per hit with layer and timestamp when known', () => {
    const text = renderRecallText([
      { layer: 'conversation', score: 0.9, text: 'a', timestamp: '2026-01-02T00:00:00.000Z' },
      { layer: 'atomic', score: 0.8, text: 'b' },
    ])
    expect(text).toBe(
      'Recalled memory relevant to this turn:\n'
      + '- (conversation, 2026-01-02T00:00:00.000Z) a\n'
      + '- (atomic) b',
    )
  })
})
