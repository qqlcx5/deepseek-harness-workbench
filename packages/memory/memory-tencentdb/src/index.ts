/**
 * TencentDB Agent Memory `MemoryProvider` plugin. It contributes to the
 * `ctx.memory` registry without owning the service.
 *
 * @module @deepseek-ai/dsh-memory-tencentdb
 */

import type { Context } from '@deepseek-ai/cordis'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { MemoryClient } from '@tencentdb-agent-memory/memory-sdk-ts-v2'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-memory'
import {
  TencentdbMemoryProvider,
} from './provider.ts'

export {
  TENCENTDB_DEFAULT_LAYER_LIMIT,
  TENCENTDB_MEMORY_PROVIDER_ID,
  TencentdbMemoryProvider,
} from './provider.ts'
export type { TencentdbMemoryProviderOptions } from './provider.ts'

/** Default `TDAI_USER_KEY` env var name consulted when `apiKey` is omitted. */
export const DEFAULT_TENCENTDB_API_KEY_ENV = 'TDAI_USER_KEY'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'memory-tencentdb'

/** The memory seam this provider registers into. */
export const inject = ['memory']

/**
 * Plugin config: the MemoryCore v3 endpoint and its strict-isolation
 * identity. Every field except `apiKey`/`layerLimit`/`timeoutMs` is required
 * at load; a missing required field fails plugin load rather than silently
 * disabling memory.
 */
export interface Config {
  /** MemoryCore base URL, for example `http://127.0.0.1:8420`. */
  endpoint: string
  /** Bearer key from the Memory Hub panel. Falls back to `$TDAI_USER_KEY`. */
  apiKey?: string
  /** Memory instance id sent as `x-tdai-service-id`. */
  serviceId: string
  /** Strict-isolation team id. */
  teamId: string
  /** Strict-isolation agent id. */
  agentId: string
  /** Strict-isolation user id. */
  userId: string
  /** Optional strict-isolation task id carried on every request. */
  taskId?: string
  /** Per-layer hit count requested from each backend search. Defaults to 8. */
  layerLimit?: number
  /** SDK transport request timeout in milliseconds. Defaults to 30000. */
  timeoutMs?: number
}

export const Config: z<Config> = z.object({
  endpoint: z.string().role('required'),
  apiKey: z.string(),
  serviceId: z.string().role('required'),
  teamId: z.string().role('required'),
  agentId: z.string().role('required'),
  userId: z.string().role('required'),
  taskId: z.string(),
  layerLimit: z.number().step(1).min(1),
  timeoutMs: z.number().step(1).min(1),
})

/**
 * Register the TencentDB Agent Memory provider with `ctx.memory`.
 * @param ctx - plugin context; the registration is disposed with it.
 * @param config - endpoint and strict-isolation identity; schemastery rejects
 *   a non-positive-integer `layerLimit`/`timeoutMs` at load.
 * @throws when the API key resolves empty through config and `$TDAI_USER_KEY`.
 */
export function apply(ctx: Context, config: Config): void {
  const apiKey = config.apiKey
    ?? launchEnvironmentOf(ctx).get(DEFAULT_TENCENTDB_API_KEY_ENV)?.value
    ?? ''
  if (apiKey.length === 0) {
    throw new Error(
      `memory-tencentdb: no API key; set Config.apiKey or store ${DEFAULT_TENCENTDB_API_KEY_ENV} in the launch environment`,
    )
  }
  const client = new MemoryClient({
    endpoint: config.endpoint,
    apiKey,
    serviceId: config.serviceId,
    teamId: config.teamId,
    agentId: config.agentId,
    userId: config.userId,
    ...config.taskId !== undefined ? { taskId: config.taskId } : {},
    ...config.timeoutMs !== undefined ? { timeout: config.timeoutMs } : {},
  })
  ctx.memory.registerMemoryProvider(new TencentdbMemoryProvider({
    client,
    ...config.layerLimit !== undefined ? { layerLimit: config.layerLimit } : {},
  }))
}
