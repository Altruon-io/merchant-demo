# Contributing

Thanks for your interest in the Altruon Merchant Demo.

> **This repository is a reference sample, not a production application.**
> Pull requests that improve clarity, documentation, or integration guidance are welcome.
> Changes that add production-only complexity (auth systems, databases, etc.) are out of scope.

## Issues

Please use [GitHub Issues](https://github.com/Altruon-io/merchant-demo/issues) for:

- Bugs in this sample (setup steps, SDK wiring, UI regressions)
- Documentation gaps in the README

For questions about the Altruon platform itself — API behaviour, dashboard configuration, routing, billing connections — see the [Altruon documentation](https://docs.altruon.io) or contact us at [altruon.io](https://www.altruon.io).

## Pull requests

This repository is **read-only** on `main` — only Altruon maintainers can push or merge.
You are welcome to fork and experiment locally, or open a PR for discussion, but changes
will only be merged by the Altruon team.

1. Fork the repo and create a branch from `main`.
2. Keep changes focused on the demo's purpose: showing a correct SDK integration pattern.
3. **Never commit secrets** — use `server/.env.example` placeholders only.
4. Open a PR with a short description of what changed and why.

## Security

If you discover a security issue in this sample, please read [SECURITY.md](SECURITY.md) before opening a public issue.
