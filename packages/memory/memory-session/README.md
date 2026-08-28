---
description: "Per-session memory consumer for ctx.memory: recalls stored memory into each turn's first step as durable context and archives finished turns, for users enabling cross-session memory."
kind: "package-reference"
---

# @deepseek-ai/dsh-memory-session

English | [中文](README.zh.md)

## Summary

`dsh-memory-session` connects the agent loop to `ctx.memory`. At each turn's first step it recalls memory for the claimed user text and appends the hits as one durable, `recall`-form user message, so the injected context persists, replays, and compacts like other conversation content. When a turn stops, it archives that turn's user and assistant messages through the seam without delaying the turn boundary. Both paths degrade to a log warning when memory fails — memory never blocks a turn. The plugin is opt-in: default compositions leave it disabled.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this plugin beside `dsh-memory` and a provider when past sessions should inform new turns and finished turns should accumulate as memory. Recall runs once per turn (at step 1) on the text of the claimed messages; later steps of the same turn continue without another recall. Archival reads the durable session log at the stopping boundary and writes only user-sourced and assistant messages — plugin-injected context is re-injectable and never archived.

### Configuration

The minimal mount needs no configuration.

```yaml
- name: '@deepseek-ai/dsh-memory-session'
```

| Field | Default | Meaning |
|---|---|---|
| `recall` | `true` | Recall stored memory into each turn's first step |
| `archive` | `true` | Archive each finished turn's user/assistant messages |
| `maxHits` | `8` | Upper bound on hits recalled into one turn |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-memory-session) is the exhaustive source for every accepted field and its JSDoc.

-----

<a id="model-experience"></a>
## Model Experience

### Recalled memory context

#### What the model sees

One user-role message appended to the turn's first step whenever recall returns hits. `<bullets>` is one `- (<layer>[, <timestamp>]) <text>` line per hit, layers being `conversation` or `atomic`.

##### Recalled memory text

```markdown
Recalled memory relevant to this turn:
<bullets>
```

#### Token effect

Conditional: one message per turn with hits, each capped by `maxHits` hit bodies; turns whose recall returns nothing add no tokens.

#### KV Cache effect

Append-only; the recall message follows the turn's admitted messages and does not invalidate an already-reusable prefix. A turn whose recall differs from the previous turn's changes only that turn's suffix.

## Known Limitations and Deferred Work

- **Recall adds first-step latency** — the pre-step waterfall awaits the provider before the step enters; a slow memory endpoint delays every first step.
- **Archival is fire-and-forget** — record failures surface as logs after the turn closed; there is no retry and no durable record of a failed archive.
- **One query per turn** — the query is the claimed messages' text only; image-only or tool-result claims recall nothing.
- **No injection on later steps** — memory recalled mid-turn by other means (for example a future `memory_search` tool) does not refresh the turn's injected context.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
