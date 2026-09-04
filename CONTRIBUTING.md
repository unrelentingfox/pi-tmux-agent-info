# Contributing

Use Node.js 22.19.0 or later.

```sh
npm ci
npm test
npm run typecheck
npm run check:package
```

Keep changes focused on Pi-to-tmux identity and status publication. Add tests
for behavior changes and use a semantic commit subject such as
`fix(status): preserve waiting state`.

Follow [RELEASING.md](RELEASING.md); the first npm publication is manual, and later matching GitHub releases publish with provenance.
