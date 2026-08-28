/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-memory-session`.
 * @module @deepseek-ai/dsh-memory-session/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-memory-session'

/** Cordis companion plugin name. */
export const name = 'memory-session-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the consumer adds model-visible content only through
 * the pre-step decision (appended as durable `user/message` events by the
 * loop), and archival reads the log rather than mutating it, so the session
 * log stays the single source the runtime invariant already asserts.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
