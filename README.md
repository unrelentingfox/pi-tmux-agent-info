# pi-tmux-agent-info

[![CI](https://github.com/unrelentingfox/pi-tmux-agent-info/actions/workflows/ci.yml/badge.svg)](https://github.com/unrelentingfox/pi-tmux-agent-info/actions/workflows/ci.yml)

A [Pi](https://github.com/earendil-works/pi) extension that publishes the
interactive parent agent's identity and lifecycle status to pane-local tmux
options. A tmux status line can then render the same contract for Pi and other
agent harnesses.

## Requirements and compatibility

- Node.js 22.19.0 or later
- tmux available on `PATH` when Pi runs inside tmux
- Pi 0.84.4 is tested; Pi packages are optional wildcard peer dependencies so
  compatible later Pi releases can supply their own runtime

The extension is inactive in Pi child subagents, Remote Procedure Call (RPC),
JSON, and print modes. Outside tmux, it registers normal interactive lifecycle
handling but emits no tmux commands. A missing or closing tmux pane does not
interrupt Pi.

## Install

```sh
pi install npm:@unrelentingfox/pi-tmux-agent-info@0.1.0
```

Run `/reload` in an existing Pi session after installation. Pi discovers
`index.ts` through the package manifest.

Pi extensions execute with your user permissions. Review the source before
installing any extension.

## Published tmux options

The extension owns only the Pi process's host pane:

- `@agent_harness`: harness name, currently `pi`
- `@agent_session_name`: optional Pi session name
- `@agent_status`: `attention`, `waiting`, `failed`, `working`, `done`, or `idle`

It republishes a complete pane snapshot on startup, reload, new session,
resume, and fork. It publishes `idle` while Pi waits for input and unsets all
three options when Pi quits. Reload and session replacement do not clear the
pane between extension generations.

Status icons are global tmux options. A renderer can use these values and
provide its own fallbacks:

```tmux
set -g @agent_icon_attention '❗'
set -g @agent_icon_waiting '❓'
set -g @agent_icon_failed '❌'
set -g @agent_icon_working '🔄'
set -g @agent_icon_done '✅'
set -g @agent_icon_idle '🤖'
```

## Configure waiting tools

Core Pi lifecycle events report work, settlement, failures, compaction, and
native user-interface prompts. To show `waiting` while selected tools execute,
create `~/.pi/agent/tmux-agent-info.json`:

```json
{
  "waitingTools": ["plannotator_submit_plan"]
}
```

The file has no built-in tool defaults. A missing file, missing key, or empty
array disables tool-based waiting. Invalid entries produce a Pi warning. The
extension reloads the file on every session start, including `/reload`, new,
resume, and fork.

Tool waits are keyed by call ID, so concurrent calls remain independent.
Native `ctx.ui.*` prompts use Pi's `ui_prompt_start` and `ui_prompt_end` events
and do not belong in `waitingTools`.

## Extension status protocol

Another independently loaded Pi extension can publish background activity not
represented by a Pi tool or native prompt. Sources must begin with `ext:` so
external publishers cannot overwrite built-in Pi state:

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

Contributions resolve by semantic priority:
`attention`, `waiting`, `failed`, `working`, `done`, then `idle`.
Malformed or unsupported protocol events are ignored.

## Other harnesses

Other harnesses do not need this Pi extension. They can set the same pane-local
contract directly and unset all three options when they exit:

```sh
tmux set-option -p -t "$TMUX_PANE" @agent_harness claude
tmux set-option -p -t "$TMUX_PANE" @agent_session_name review-auth
tmux set-option -p -t "$TMUX_PANE" @agent_status working
```

The extension invokes `tmux` directly with an argument array rather than a
shell command. Session names remain one argument, including shell-special
characters. It trusts the `tmux` executable resolved from `PATH` and the pane
identifier in `TMUX_PANE`; do not run Pi with an untrusted `PATH` or inherited
tmux environment.

## Development

```sh
npm ci
npm test
npm run typecheck
npm run check:package
```

Continuous integration runs these checks on Node.js 22 and 24. The package
content check fails if the npm tarball gains an undeclared file. Tests use
fakes and do not require a live tmux server.

Releases use Semantic Versioning. A GitHub release tagged `vX.Y.Z` must match
`package.json`; the protected `npm` environment publishes with npm trusted
publishing and provenance. Changes are recorded in [CHANGELOG.md](CHANGELOG.md).

## License

MIT. See [LICENSE](LICENSE).

Source, issues, and security reporting are at
<https://github.com/unrelentingfox/pi-tmux-agent-info>.
