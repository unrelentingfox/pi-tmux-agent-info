# Security policy

## Supported versions

Only the latest release receives security fixes.

## Reporting a vulnerability

Report vulnerabilities privately through
[GitHub Security Advisories](https://github.com/unrelentingfox/pi-tmux-agent-info/security/advisories/new).
Do not open a public issue for an undisclosed vulnerability.

This extension invokes the `tmux` executable available on `PATH` and writes
pane-local user options for the pane named by `TMUX_PANE`. Install only code
that you trust, because Pi extensions run with the user's permissions.
