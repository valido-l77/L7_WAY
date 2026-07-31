# L7_WAY Entity Registry

This registry defines the minimal metadata every entity must declare. An entity can be a tool, service, workflow, UI component, or project.

## Required Fields
- `entity_id`: stable identifier (string)
- `entity_type`: tool | service | workflow | ui | project
- `birth_date`: ISO-8601 date
- `owner`: accountable person or team
- `lifecycle`: summoned | oath | formed | serving | mature | sunset | archived
- `lineage`: parent entity or predecessor (if any)
- `l7_declaration`: full L7 metadata block

`status` is a deprecated compatibility alias during the v1 migration.
`preview`, `active`, and `deprecated` normalize to `formed`, `serving`, and
`sunset` respectively.

## Lifecycle Stages
- **summoned**: scoped and named
- **oath**: L7 + gateway compliance declared
- **formed**: adapters and interfaces exist
- **serving**: in active use
- **mature**: stable, versioned, documented
- **sunset**: decommission in progress
- **archived**: fully decommissioned

The normal progression follows the order above. A serving entity may move
directly to sunset; no other stages may be skipped.

## Dimensional Boundary

`l7_declaration` is the stable public 7D language. Derived 12D coordinates
belong in the separately versioned `internal_projection` field. They may guide
routing and similarity, but never grant identity, authentication, or
authorization.

## Composition Rule
Entities should be small and composable. New entities are formed by citizen groups (composed units), not monoliths.

## Registry Rule
Entities without a birth date, L7 declaration, or owner are non-compliant.
The executable v1 definition is `schema/v1/entity.schema.json`.
