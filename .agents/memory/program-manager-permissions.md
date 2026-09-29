---
name: Program Manager permissions
description: Role boundaries for point totals, regular missions, and Super Scrambles.
---

The Program Manager (owner role) has direct score-setting control for every group and is the only role that can create or change a Super Scramble. Counselors may create regular Missions, but cannot submit Super Scramble content.

**Why:** The user defined the Program Manager as the admin with full point control and sole Super Scramble authority, while explicitly keeping regular Mission creation available to counselors.

**How to apply:** Keep these checks in both the UI and command handler. Counselor-created Mission requests should continue working; reject counselor `addActivity` commands whose type is `Super Scramble`.