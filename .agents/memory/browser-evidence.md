---
name: Multi-session browser evidence
description: Handling inconsistent browser-test observations in live pairing checks.
---

Verify that a test page's room identity matches its authenticated session before trusting its UI observations.

**Why:** Repeated multi-context browser tests reported historical room content even when authenticated HTTP responses identified fresh rooms. Repeated reloads did not consistently resolve this; such evidence cannot establish an application failure or a passing UI journey.

**How to apply:** Isolate test contexts and cross-check direct page observations against authenticated session responses. If those disagree, report UI verification as inconclusive and use focused HTTP and unit checks for what they can establish. Do not repeatedly rerun a whole journey or alter application authentication based only on inconsistent snapshots.