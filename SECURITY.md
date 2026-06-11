# Security policy

## Demo scope

This repository is a **public reference integration** for the [Altruon JS SDK](https://docs.altruon.io/docs/developers/altruon-js/quick-start). It is intentionally simplified for learning and evaluation — not hardened for production deployment as-is.

## Reporting a vulnerability

If you believe you have found a security vulnerability in the Altruon platform (not just this sample), please report it responsibly via [altruon.io](https://www.altruon.io) rather than opening a public GitHub issue.

For issues limited to this demo repository (e.g. accidental secret exposure in a commit), open a private report or contact the Altruon team directly.

## Secrets and credentials

- **Never commit** `server/.env` or real API keys.
- The Altruon **secret key** must stay server-side — see the [Security checklist](README.md#security-checklist-for-your-real-integration) in the README.
- Use **sandbox keys** only when running this demo locally.

## Production checklist

Before deploying your own integration based on this sample, review the README's security checklist: authenticate your backend routes, restrict CORS, use HTTPS, and protect transaction lookups per user.
