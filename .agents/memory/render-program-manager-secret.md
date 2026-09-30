---
name: Render Program Manager secret
description: Production API configuration when RAS-Edison is hosted on Render.
---

The Program Manager session-creation password must be configured in the environment of the API service that handles session creation. Replit Secrets do not automatically transfer to Render; set the same intended value in Render's API service environment.

**Why:** A password configured in Replit can make the workspace preview work while the separate Render-hosted API still reports that Program Manager access is not configured.

**How to apply:** Add `PROGRAM_MANAGER_ROLE_PASSWORD` to the Render API service, not only to the frontend or Replit. Never place the value in chat or logs.