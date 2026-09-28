---
name: Live app vs canvas preview
description: Distinguishes the running RAS-Edison artifact from its copied canvas mockup.
---

The registered RAS-Edison artifact and the extracted “Current · RAS-Edison Points” mockup run separate code and state. Changes to the live app do not update the mockup, and the mockup is not connected to pairing or point requests.

The public `edisonras.onrender.com` site is also separate from Replit publishing. This Repl has no active Replit deployment or Render integration, so changes in the workspace do not by themselves update that URL.

**Why:** Testing the mockup can make working app changes appear missing, and a mockup cannot verify point-command behavior.

**How to apply:** Before diagnosing counselor UI, identify whether the user is on the Replit artifact, the canvas mockup, or the Render site. Verify behavior in the intended deployment with an authenticated counselor session. Treat the mockup as visual-only and do not assume Replit preview changes are live on Render.