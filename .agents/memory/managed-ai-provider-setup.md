---
name: Managed AI provider setup
description: Account restrictions can block managed AI setup; fallback to a user-owned key requires consent.
---

When a managed AI provider setup reports an account-status restriction, treat it as an access blocker rather than an application-code failure. Follow the provider skill's retry limit, then stop and ask before using a user-owned key or another provider path.

**Why:** Repeated setup attempts did not change the account restriction, and the application itself was not the source of the failure.

**How to apply:** Check for a working managed provider connection first. If setup remains blocked, keep credentials out of chat and do not configure a user-owned key unless the user approves that route.