---
description: "The memory group map: the agent-memory capability seam and its provider and session consumer, for users and maintainers navigating the group."
kind: "package-group"
---

# memory/ — Agent-memory capability seam

English | [中文](README.zh.md)

## Summary

The memory group gives agents durable memory across sessions through one capability seam: `dsh-memory` defines `ctx.memory` with provider-selecting recall and record, `dsh-memory-tencentdb` implements the provider against a TencentDB Agent Memory MemoryCore v3 endpoint, and `dsh-memory-session` recalls stored memory into each turn's first step as durable context and archives finished turns. All packages are opt-in; default compositions mount none of them. This page maps the group; each package README owns the per-package contract.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

| Package | Role | ctx key |
|---|---|---|
| [`memory/`](memory/README.md) | Service Definition: provider registry plus recall/record execution with one selection policy | `ctx.memory` |
| [`memory-tencentdb/`](memory-tencentdb/README.md) | Service Provider: L0/L1 recall and L0 archival against MemoryCore v3 | — |
| [`memory-session/`](memory-session/README.md) | Consumer: per-turn recall injection and turn archival through the seam | — |

-----

<a id="related-documentation"></a>
## Related documentation

- [Generated configuration catalog](../../docs/config-catalog.md) — every config field the group's packages accept.
- [Memory subsystem](../../docs/subsystems/memory.md) — the seam's selection policy, vocabulary, and session-consumer integration.
- [TencentDB Agent Memory](https://github.com/Tencent/TencentDB-Agent-Memory) — the upstream memory server this group's provider targets.

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
