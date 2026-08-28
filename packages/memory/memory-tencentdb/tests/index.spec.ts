import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import MemoryRuntime, { MemoryError } from '@deepseek-ai/dsh-memory'
import * as plugin from '../src/index.ts'

interface Mount {
  readonly ctx: Context
}

async function mount(config: plugin.Config): Promise<Mount> {
  const ctx = new Context()
  await ctx.plugin(MemoryRuntime)
  await ctx.plugin(plugin, config)
  return { ctx }
}

const baseConfig: plugin.Config = {
  endpoint: 'http://127.0.0.1:8420',
  apiKey: 'sk-mem-test',
  serviceId: 'mem-1',
  teamId: 'team-1',
  agentId: 'agt-1',
  userId: 'usr-1',
}

const ORIGINAL_USER_KEY = process.env['TDAI_USER_KEY']

afterEach(() => {
  if (ORIGINAL_USER_KEY === undefined) delete process.env['TDAI_USER_KEY']
  else process.env['TDAI_USER_KEY'] = ORIGINAL_USER_KEY
})

describe('memory-tencentdb plugin load', () => {
  it('registers the tencentdb provider into ctx.memory', async () => {
    const { ctx } = await mount(baseConfig)
    // The same id cannot register twice: a second mount proves the first
    // registration exists without issuing any network request.
    await expect(ctx.plugin(plugin, baseConfig)).rejects.toThrow(
      expect.objectContaining({ code: 'MEMORY_DUPLICATE_PROVIDER' }) as MemoryError,
    )
  })

  it('throws at load when no API key resolves', async () => {
    const { apiKey: _omitted, ...withoutKey } = baseConfig
    void _omitted
    delete process.env['TDAI_USER_KEY']
    const ctx = new Context()
    await ctx.plugin(MemoryRuntime)
    await expect(ctx.plugin(plugin, withoutKey)).rejects.toThrow('memory-tencentdb: no API key')
  })

  it('resolves the API key from $TDAI_USER_KEY when config omits it', async () => {
    process.env['TDAI_USER_KEY'] = 'sk-mem-env'
    const { apiKey: _omitted, ...withoutKey } = baseConfig
    void _omitted
    const { ctx } = await mount(withoutKey)
    await expect(ctx.plugin(plugin, Object.assign({}, withoutKey, { apiKey: 'other' }))).rejects.toThrow(
      expect.objectContaining({ code: 'MEMORY_DUPLICATE_PROVIDER' }) as MemoryError,
    )
  })

  it('throws at load when layerLimit is not a positive integer', async () => {
    const ctx = new Context()
    await ctx.plugin(MemoryRuntime)
    const config: plugin.Config = Object.assign({}, baseConfig, { layerLimit: 0 })
    await expect(ctx.plugin(plugin, config)).rejects.toThrow('invalid config')
  })

  it('throws at load when timeoutMs is not a positive integer', async () => {
    const ctx = new Context()
    await ctx.plugin(MemoryRuntime)
    const config: plugin.Config = Object.assign({}, baseConfig, { timeoutMs: 0.5 })
    await expect(ctx.plugin(plugin, config)).rejects.toThrow('invalid config')
  })

  it('accepts taskId, layerLimit, and timeoutMs overrides', async () => {
    const ctx = new Context()
    await ctx.plugin(MemoryRuntime)
    const config: plugin.Config = {
      endpoint: 'http://127.0.0.1:8420',
      apiKey: 'sk-mem-test',
      serviceId: 'mem-1',
      teamId: 'team-1',
      agentId: 'agt-1',
      userId: 'usr-1',
      taskId: 'task-9',
      layerLimit: 5,
      timeoutMs: 5000,
    }
    const { ctx: mounted } = { ctx }
    await mounted.plugin(plugin, config)
    await expect(ctx.plugin(plugin, config)).rejects.toThrow(
      expect.objectContaining({ code: 'MEMORY_DUPLICATE_PROVIDER' }) as MemoryError,
    )
  })
})
