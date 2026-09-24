---
name: Post-merge verification
description: Why successful automatic merges still require focused checks
---

After automated reconciliation, compare the merged result against the previously tested version and rerun affected type checks and tests, including files not listed as conflicted.

**Why:** An automatic merge duplicated unrelated route handlers and interleaved test bodies in files reported as resolved. Pre-merge passing tests did not apply to that merged result.

**How to apply:** Inspect unexpected diffs outside the manual conflict files; preserve intentional incoming changes, regenerate generated clients, and validate the merged source before completion.