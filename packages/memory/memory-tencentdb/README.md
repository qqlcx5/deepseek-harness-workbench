---
description: "TencentDB Agent Memory provider for ctx.memory: L0/L1 recall and L0 archival against a MemoryCore v3 endpoint, for operators wiring the harness to a Memory Hub."
kind: "package-reference"
---

# @deepseek-ai/dsh-memory-tencentdb

English | [中文](README.zh.md)

## Summary

`dsh-memory-tencentdb` registers one `MemoryProvider` (`tencentdb`) into `ctx.memory`, backed by a [TencentDB Agent Memory](https://github.com/Tencent/TencentDB-Agent-Memory) MemoryCore v3 endpoint through the official TypeScript SDK. Recall searches the L0 conversation store and the L1 atomic store in parallel and merges the hits by descending score; archival writes finished turns as L0 messages. Isolation is strict: `teamId`/`agentId`/`userId` identify the memory namespace at load, and every request carries the calling session's id.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this plugin beside `dsh-memory` when a Memory Hub instance stores your team's memory. The endpoint, instance, and strict-isolation identity are load-time requirements: a missing field fails plugin load. The API key falls back to `$TDAI_USER_KEY` in the launch environment.

```yaml
- name: '@deepseek-ai/dsh-memory-tencentdb'
  config:
    endpoint: http://127.0.0.1:8420
    serviceId: mem-inst-1
    teamId: team-1
    agentId: agt-1
    userId: usr-1
```

| Field | Default | Meaning |
|---|---|---|
| `endpoint` | required | MemoryCore base URL |
| `apiKey` | `$TDAI_USER_KEY` | Bearer key from the Memory Hub panel |
| `serviceId` | required | Memory instance id (`x-tdai-service-id`) |
| `teamId` / `agentId` / `userId` | required | Strict-isolation namespace |
| `taskId` | none | Optional task dimension carried on every request |
| `layerLimit` | `8` | Hits requested from each backend search |
| `timeoutMs` | `30000` | SDK transport request timeout |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-memory-tencentdb) is the exhaustive source for every accepted field and its JSDoc.

### What recall returns

Conversation hits carry `layer: 'conversation'`, the speaker role, and the message timestamp when the backend supplies one; atomic hits carry `layer: 'atomic'` and their `updated_at`. The provider ranks the merged list by descending backend score; the seam truncates to the consumer's limit.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through [`dsh-memory-session`](../memory-session/README.md#model-experience): this package supplies ranked hits and archival but injects no model-visible content itself.

#### KV Cache effect

The provider performs no model request and adds no request tokens; consumer-owned injections are append-only and do not invalidate an already-reusable prefix.

## Known Limitations and Deferred Work

- **L2/L3 are not recalled** — the provider searches L0 conversations and L1 atomics; scenario (L2) and persona (L3) assets stay reachable only through the Memory Hub panel.
- **Cancellation is best-effort** — the SDK transport honors only its configured timeout; an `AbortSignal` is checked before each backend call but cannot cancel one in flight.
- **Scores are not comparable across instances** — merging assumes one backend scored both layers; mixing endpoints behind one provider id would rank incoherently.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
