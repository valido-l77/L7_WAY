# L7 Gateway Client

A zero-dependency browser and server client for the governed public L7 job API.
It never accepts an AVLI worker URL or service token; browsers communicate only
with L7 and use the authenticated session selected by the host application.

`index.d.ts` and the OpenAPI bundle at `generated/contracts/v1/openapi.json`
are generated from the canonical worker schemas by:

```bash
node scripts/build-worker-contract-bundle.js
```
