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

The extension consumes only Pi lifecycle events and one generic external
protocol. Core Pi reports agent work, terminal results, compaction, and native
UI prompts. A configured tool reports `waiting` from its
`tool_execution_start` event through the matching `tool_execution_end` event.

Configure tool waits in `~/.pi/agent/tmux-agent-info.json`:

```json
{
  "waitingTools": [
    "plannotator_submit_plan"
  ]
}
```

The file has no built-in tool defaults. A missing file, missing key, or empty
array disables tool-based waiting. Invalid entries are ignored with a warning.
The extension reloads this file on every session start, including `/reload`,
new, resume, and fork.

Tools are keyed by call ID, so concurrent waits remain independent. Native
`ctx.ui.*` prompts use Pi's `ui_prompt_start` and `ui_prompt_end` events and do
not need to appear in `waitingTools`. Pi coalesces nested prompts into one outer
prompt span, so one native prompt contribution covers the full wait.

An independently loaded Pi extension can use the generic event protocol for
background activity that is not represented by a Pi tool or native prompt. Its
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
