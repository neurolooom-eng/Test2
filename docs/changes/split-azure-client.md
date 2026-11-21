---
bump: patch
---
**Changed (code structure)**
- `src/azureDevOps.ts` (1,037 lines) is split in three: `azureClient.ts` (connection settings, the transport, api-version negotiation, the write guards and the request bodies), `azureRead.ts` (iterations, the backlog fetch and its mapping, field names, team members) and `azureDevOps.ts` (the writes), which re-exports the other two so every import stays as it was. No behaviour changes; the same unit and end-to-end tests pass.
