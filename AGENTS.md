# AGENTS.md

## Extension integrations

- Keep each external-extension integration isolated in its own `triggers/<extension>.ts` file. Do not couple core extension startup to another extension's package or private imports.
- All triggers are optional: when a target extension is not installed or its status data is unavailable, fail gracefully and leave other triggers working.
- Test both the present and absent target-extension paths when adding or changing an integration.
