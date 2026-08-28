---
description: "The agent-memory service (ctx.memory): how deployments and plugin authors recall stored memory and archive conversation through interchangeable providers, with one selection policy and error vocabulary."
kind: "package-reference"
---

# @deepseek-ai/dsh-memory

English | [中文](README.zh.md)

## Summary

`dsh-memory` is the Service Definition of the memory capability seam: one provider registry exposed as `ctx.memory`, with `recall()` and `record()` execution that selects a provider at call time. A provider supplies ranked memory hits for a query and archives finished conversation fragments under a session-scoped isolation key. Selection is registration-order-independent: a configured provider id must exist and be usable, and without one exactly one usable provider is required. The shipped provider is [`dsh-memory-tencentdb`](../memory-tencentdb/README.md); the session consumer is [`dsh-memory-session`](../memory-session/README.md).

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Deployments mount this package once to expose `ctx.memory`; a provider package registers into it, and a consumer package drives it. The seam owns no backend: without a registered usable provider, `recall()`/`record()` throw `MemoryError` with the codes below.

### Extension points

- `registerMemoryProvider(provider)` — register one `MemoryProvider` under its `id`; returns the disposer. Duplicate ids throw `MEMORY_DUPLICATE_PROVIDER`.
- `recall(request, signal?)` — recall ranked hits for a query under a session scope; the seam truncates to `request.limit`.
- `record(request, signal?)` — archive one finished conversation fragment under a session scope.

### Selection policy

| Configured `provider` | Registered providers | Outcome |
|---|---|---|
| set | id registered and `available()` | that provider |
| set | id not registered | `MEMORY_PROVIDER_CONFIGURED_MISSING` |
| set | id registered, unavailable | `MEMORY_PROVIDER_CONFIGURED_UNAVAILABLE` |
| omitted | exactly one usable | that provider |
| omitted | multiple usable | `MEMORY_PROVIDER_AMBIGUOUS` |
| omitted | none usable | `MEMORY_PROVIDER_UNAVAILABLE` |

`$DSH_MEMORY_PROVIDER` feeds the same field as `provider` and is not a hidden priority chain.

```yaml
- name: '@deepseek-ai/dsh-memory'
  config:
    provider: tencentdb
```

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-memory) is the exhaustive source for every accepted field and its JSDoc.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through [`dsh-memory-session`](../memory-session/README.md#model-experience): this package defines the seam and selects providers but injects no model-visible content itself.

#### KV Cache effect

The seam performs no model request and adds no request tokens; consumer-owned injections are append-only and do not invalidate an already-reusable prefix.

## Known Limitations and Deferred Work

- **No write-time deduplication** — `record()` stores what the consumer hands it; replaying the same turn into a live provider twice writes duplicate fragments. Consumers own turn-boundary detection.
- **No cross-session aggregation** — isolation is keyed by the caller's `sessionId`; aggregating across sessions is provider behavior outside the seam.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
