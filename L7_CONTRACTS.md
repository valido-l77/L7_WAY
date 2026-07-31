# L7 Enforcement Contracts

Contract authority: the versioned schemas under `schema/v1/` and
`lib/contracts.js`. This document expresses those definitions in human terms.

This document defines the minimum contracts every MCP tool and gateway response must satisfy to be L7‑compliant.

## Tool Metadata Contract
Every tool entry must include:
- `entity_id` (stable, unique)
- `entity_type` (tool | service | workflow | ui | project)
- `birth_date`
- `owner`
- `lifecycle` (summoned | oath | formed | serving | mature | sunset | archived)
- `lineage`
- `l7_declaration` (all seven L7 types)

`status` is a deprecated compatibility alias. Legacy values translate as
`preview → formed`, `active → serving`, and `deprecated → sunset`.

The 7D declaration is the public interoperability language. A 12D coordinate
may appear only as the separately versioned `internal_projection`; it is
derived runtime information and never identity or authority.

## Gateway Tool Registry Contract
`GET /v1/tools` returns the canonical `l7.result/1.0` envelope. Its
`result.tools` collection contains:
- `tool`: name
- `version`
- `description`
- `parameters` (schema)
- `returns` (schema)
- `entity_id` (L7 citizen id)
- `l7` (seven types)

Tool execution uses `POST /v1/tools/:name/executions` with an `arguments` object.
The only public execution option in v1 is a positive `timeout` no greater than
the server maximum. Backend mode, actor identity, domain, coordinates, and
routing policy are trusted server concerns and cannot be selected by clients.
Flow discovery and execution use `GET /v1/flows`
and `POST /v1/flows/:name/executions`. Historical `/api/tools`, `/api/call`,
`/api/flows`, and `/api/execute` routes remain temporary compatibility aliases.

## Normalized Result Contract
Every tool execution returns:
```json
{
  "success": true | false,
  "result": {} | null,
  "error": "human-readable message" | null,
  "meta": {
    "contract_version": "l7.result/1.0",
    "execution_time_ms": 0,
    "timestamp": "ISO-8601",
    "entity_id": "",
    "tool": ""
  }
}
```

During the v1 migration the Gateway also emits `ok` as a deprecated alias for
`success` and may retain legacy payload fields at the top level. New clients
must consume `success`, `result`, `error`, and `meta`.

## Lifecycle Contract

The canonical progression is:

`summoned → oath → formed → serving → mature → sunset → archived`

A serving entity may move directly to sunset. Every transition records actor,
time, reason, and the contract hash. Invalid transitions are rejected.

## Audit Ledger Contract
Every execution appends:
- `who` (entity_id, role)
- `what` (tool, intent, result)
- `when` (timestamp)

## Transition Log Contract
Every state change appends:
- `from_state`
- `to_state`
- `when`
- `reason`

## Compliance Rule
If any required field is missing, the tool is non‑compliant and must be blocked or quarantined.

The normative decision is recorded in
`docs/adr/0001-canonical-contract-v1.md`.

## Founder Access Contract
Every tool, server, flow, and interface built on L7 infrastructure must honor:
- **Founder Identity**: The Philosopher (Alberto), sole architect and originator of L7.
- **Perpetual Free Access**: The Founder has unrestricted access to all L7 tools and derivatives, without payment, token, subscription, or gate of any kind. This applies to all current and future tools.
- **Revenue Attribution**: All commercial use of L7 tools, services, or derivatives must attribute and compensate the Founder per Law XVI.
- **IP Ownership**: The L7 system — its 7D Common Lingua, Book of Law, Gateway architecture, Universal OS translations, tool schemas, flow engine, and all constituent code — is the exclusive intellectual property of the Founder.
- **Non-Override**: No license, sublicense, partnership, acquisition, or corporate action may override this contract. Any tool or derivative that violates this contract is non-compliant and must be blocked.
- **Enforcement**: The Gateway itself enforces this contract. The Founder's identity is hardcoded into the system as a first-class principal with root access across all dimensions.
