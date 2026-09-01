# pi-tmux-agent-info

Publishes Pi identity and status to pane-local tmux options. The tmux renderers
use the same contract for every agent harness:

- `@agent_harness`: harness name, such as `pi`
- `@agent_session_name`: optional session name
- `@agent_status`: `attention`, `waiting`, `failed`, `working`, `done`, or `idle`

Status icons are global tmux options and can be changed without editing scripts:

```tmux
set -g @agent_icon_attention '❗'
set -g @agent_icon_waiting '❓'
set -g @agent_icon_failed '❌'
set -g @agent_icon_working '🔄'
set -g @agent_icon_done '✅'
set -g @agent_icon_idle '🤖'
```

The renderers use these values when set and retain the same emojis as fallbacks.

Pi owns only its host pane. It republishes the full pane snapshot on every
session start, including startup, reload, new, resume/reopen, and fork. It
publishes `idle` while it waits for input and unsets all three options on
shutdown. Child subagents do not register this extension, so they do not affect
the parent pane identity or status.

## Pi status sources

Trigger modules under `triggers/` translate one event family each. To support
another Pi extension, implement `StatusTrigger` and add it to
`triggers/index.ts`. Trigger-local source and item IDs stay inside the Pi
adapter. Only the resolved semantic status reaches tmux.

```ts
import type { StatusTrigger } from "./triggers/types.ts";

export const deployTrigger: StatusTrigger = {
  source: "ext:deploy-extension",
  register(pi, contributions) {
    const dispose = pi.events.on("deploy:changed", (event: any) => {
      if (event.active) contributions.upsert("ext:deploy-extension", event.id, "working");
      else contributions.remove("ext:deploy-extension", event.id);
    });
    return () => {
      dispose?.();
      contributions.clearSource("ext:deploy-extension");
    };
  },
};
```

An independently loaded Pi extension can use the generic event protocol. Its
source must start with `ext:` so it cannot overwrite built-in Pi state:

```ts
pi.events.emit("tmux-agent-status:v1", {
  version: 1,
  action: "upsert",
  source: "ext:deploy-extension",
  id: "production",
  status: "waiting",
});

pi.events.emit("tmux-agent-status:v1", {
  version: 1,
  action: "remove",
  source: "ext:deploy-extension",
  id: "production",
});
```

## Browser plan review

`plannotator_submit_plan` reports `waiting` only while its browser review is
open, from tool start through the matching tool end. It does not label other
planning or execution work as waiting. Concurrent reviews remain independent.

## Hermes memory activity

When `pi-hermes-memory` is loaded, this extension reports its public tool
activity as `working`: `memory_add`, `memory_replace`, `memory_remove`,
`memory_search`, `session_search`, and `skill_manage`. A failed Hermes tool
keeps a `failed` status until the next Hermes tool or agent run starts.

This cannot observe Hermes private background review, session flush, or
auto-consolidation. Hermes uses direct model calls and does not emit a public
lifecycle event for them. Upstream Hermes can provide complete status coverage
by emitting the `tmux-agent-status:v1` protocol described above with its own
`ext:` source name.

## Other harnesses

Other harnesses do not need Pi code. Set the same pane-local options directly:

```sh
tmux set-option -p -t "$TMUX_PANE" @agent_harness claude
tmux set-option -p -t "$TMUX_PANE" @agent_session_name review-auth
tmux set-option -p -t "$TMUX_PANE" @agent_status working
```

Unset all three options when the harness exits.

Pane labels render as `c:<harness>:<session name>:<status>`, with empty trailing
segments omitted. For example, a working named Pi session is
`c:pi:review-auth:🔄`. A manual pane title still takes priority. Window labels
preserve the normal window name and append one status token for each agent pane.
Agent names and session names are not shown in window labels.
