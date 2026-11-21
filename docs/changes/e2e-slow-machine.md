---
bump: patch
---
**Tests**
- **End-to-end tests on a slow machine** — CI also runs every end-to-end scenario with the page on a CPU four times slower (Chromium's throttling), in its own job, so a step that only works because the app is fast fails in CI before users meet it (CI-12).

TC-CI-08.
