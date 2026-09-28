---
name: Live app vs canvas preview
description: Distinguishes the running RAS-Edison artifact from its copied canvas mockup.
---

The registered RAS-Edison artifact and the extracted “Current · RAS-Edison Points” mockup run separate code and state. Changes to the live app do not update the mockup, and the mockup is not connected to pairing or point requests.

**Why:** Testing the mockup can make working app changes appear missing, and a mockup cannot verify point-command behavior.

**How to apply:** Before diagnosing counselor UI, identify the frame being tested and verify behavior in the registered artifact with an authenticated counselor session. Treat the mockup as visual-only.