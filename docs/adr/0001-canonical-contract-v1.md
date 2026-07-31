# ADR 0001: Canonical L7 Contract v1

- Status: Accepted
- Date: 2026-07-20
- Decision owner: Alberto Valido Delgado

## Context

L7 currently expresses the same concepts through several partially overlapping
documents, schemas, and runtime objects. Public declarations use seven
dimensions, internal modules use twelve coordinates, lifecycle states differ
between registry and doctrine, and execution results alternate between
`{ ok, ... }` and `{ success, result, error, meta }`.

The Translator doctrine requires one stable external language. The internal
model may continue to evolve, but clients must not inherit that instability.

## Decision

### Public and internal dimensions

The seven-dimensional Common Lingua is the stable public interoperability
contract. It declares capability, data, policy/intent, presentation,
orchestration, time/versioning, and identity/security.

The twelve-dimensional dodecahedron is a derived, versioned internal
projection. It may inform routing, similarity, and field behavior, but it is
not identity, authentication, authorization, or source truth. Astrocyte records
projection uncertainty.

`entity_type` remains outside both dimensional systems and states what the
entity is.

### Lifecycle

The canonical lifecycle is:

`summoned → oath → formed → serving → mature → sunset → archived`

Legacy values map as follows:

- `preview → formed`
- `active → serving`
- `deprecated → sunset`
- `archived → archived`

Every lifecycle change is a transition event with actor, time, reason, and the
hash of the entity contract being changed.

### Execution result

The canonical result envelope is:

```json
{
  "success": true,
  "result": {},
  "error": null,
  "meta": {
    "contract_version": "l7.result/1.0",
    "timestamp": "2026-07-20T00:00:00.000Z"
  }
}
```

`error` is a human-readable string or `null` in v1. A stable machine error code
may be carried as `meta.error_code`.

During migration, `ok` is emitted as a deprecated alias for `success`, and
legacy non-reserved payload fields may also remain at the top level. New code
must read the canonical fields. Compatibility aliases will be removed only in
a future major Gateway contract.

### Contract versions

Contract identifiers use `name/major.minor`. Breaking changes increment major;
backward-compatible additions increment minor. Patch changes belong to the
implementation version and do not change a contract identifier.

The authoritative identifiers live in `lib/contracts.js` and
`schema/v1/contract-versions.json`.

## Consequences

- Clients can remain stable while 12D projection algorithms evolve.
- Existing `ok` consumers continue to work during migration.
- Schemas become the executable source for conformance checks.
- Registry and runtime data require migration to the canonical lifecycle.
- Future authorization code must never derive permission from a coordinate.

## Verification

- Contract constants and schemas must agree in automated tests.
- Canonical result envelopes must validate against the v1 result schema.
- Entity fixtures must validate against the public 7D schema and may include a
  separately versioned 12D projection.
- Legacy lifecycle mappings must be deterministic and explicit.
