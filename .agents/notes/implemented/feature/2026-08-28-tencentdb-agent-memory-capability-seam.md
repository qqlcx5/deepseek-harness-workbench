# Agent Note: TencentDB Agent Memory capability seam

Status: implemented

English | [中文](2026-08-28-tencentdb-agent-memory-capability-seam.zh.md)

## Problem

TencentDB Agent Memory ships two integration shapes for agent harnesses, and neither matches this repository's plugin model. The Memory Proxy route rewrites model traffic server-side: it requires pointing the harness's LLM provider at the proxy, couples memory injection to one provider route, and cannot serve any deployment that keeps its own model routing. The upstream `pi-plugin` registers a whole provider for the same reason — it routes requests, so memory exists only on the provider that carries it. Neither shape gives the harness a memory capability that survives a provider swap, and neither integrates with the durable session log, so injected memory would live outside the model-visible-means-logged invariant.

## Decision

**Memory is a capability seam, not a provider route.** `dsh-memory` defines `ctx.memory` with the same selection semantics as `ctx.web`: a provider registry, execution-time resolution (configured id must exist and be usable; otherwise exactly one usable provider), and a provider-agnostic `MemoryHit`/`MemoryTurnMessage` vocabulary. The seam owns no backend and injects nothing; swapping providers moves the whole capability, exactly as the shell and web seams do.

**The official SDK is the transport, not a hand-rolled client.** `dsh-memory-tencentdb` wraps `@tencentdb-agent-memory/memory-sdk-ts-v2` rather than reimplementing the v3 strict-isolation API. The SDK's `Transport` constructor keeps the provider testable without a network, and `withIsolation({ sessionId })` derives one client view per call, so the calling session's id — never a plugin-level constant — scopes every read and write. Recall searches L0 conversations and L1 atomics in parallel and merges by descending backend score; the seam, not the provider, truncates to the consumer's limit, mirroring `capSources`.

**The consumer rides the loop's existing extension points.** `dsh-memory-session` recalls at the first step of each turn through the `agent/pre-step` waterfall and appends the hits as one durable user message with `form: 'recall'` — material lifted from other sessions, which is that form's declared meaning. Archival reads the durable log at the `agent/turn-stopping` boundary and writes user-sourced and assistant messages only: plugin-injected context is re-injectable and archiving it would duplicate on the next recall. Record failures surface as logs after the turn closed; memory never blocks or delays a turn boundary (recall is awaited because the model must see its result; archival is fire-and-forget because nothing downstream reads it).

**Degradation is a warning, never a turn failure.** A recall error or an unavailable provider logs and yields the untouched decision; the turn proceeds without memory. This differs from the web tools, which surface provider failure to the model as a structured tool error — there the model asked; here the user did not.

**What we gave up.** L2 scenarios and L3 personas are not recalled (panel-only upstream); cancellation is best-effort because the SDK transport honors only its configured timeout; and the recall query is the claimed messages' text only, so image-only claims recall nothing. Each is recorded in the package README's limitations rather than hidden behind a fallback.

## Consequences

Memory now rides the standard composition path: a deployment enables cross-session memory by mounting three opt-in packages, no provider route changes, and the recalled text enters the durable log where compaction, replay, and telemetry already operate. The `memory` ctx key reserves the seam name for future providers (a vector store, a local sqlite backend) without touching consumers. The beta-pinned SDK dependency is the first external runtime dependency in the group and stays behind the provider package boundary, so the seam and consumer compile without it.

## Alternatives considered

- **Proxy route** (upstream's documented dsh integration): zero code, but memory becomes inseparable from one LLM provider route and bypasses the session log. Kept as an operator choice outside this seam; the packages never assume it.
- **`memory_search` as the only consumer**: a model-facing tool alone would make recall opt-in per turn by the model's own choice, losing the automatic cross-session continuity that motivated the integration; deferred until a need appears.
- **Archiving in `turn/end`**: `agent/turn-stopping` is the last listener-owned boundary before the turn commits; reading the log there cannot race a later append into the same turn.
