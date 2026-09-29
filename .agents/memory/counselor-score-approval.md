---
name: Counselor score changes
description: Approval and assignment rules for counselor point changes.
---

Counselor-initiated score changes, including setting an exact group total, must target only the counselor's assigned group and enter the Program Manager approval queue rather than changing the score immediately. The Program Manager can set any group's exact total directly; record the reason and actual score delta.

**Why:** The user chose approval for exact-total edits to preserve manager oversight of counselor score changes.

**How to apply:** Enforce counselor role and assigned-group checks on the server, not only in the UI. Reuse the pending point approval flow for counselors; its existing behavior auto-approves unresolved requests after 60 minutes, so explain that when relevant. Allow owner-role Program Managers to set totals immediately and retain a history entry.