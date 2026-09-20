# OSA Cloud Workspace V3 — Multi-Cloud Control Plane

## Goal lock

OSA Cloud Workspace remains one control plane. Azure and AWS are added as providers under the existing product, not as separate applications.

```text
OSA CLOUD WORKSPACE
      |
ACTIVE PROVIDER
  |      |      |
 GCP   AZURE   AWS
```

Top-level operator switch:

```text
[ GOOGLE CLOUD ] [ AZURE ] [ AWS ]
```

The selected provider changes execution context, not the mental model of the product.

## Existing product surfaces stay canonical

- Command
- Agents
- Automations
- Portfolio
- Dev Tools
- Test Lab
- Deploy
- Infra
- Costs

## Core architecture

```text
UI
 |
OSA CLOUD CORE
 |
PROVIDER CONTRACT
 |        |        |
GCP     AZURE     AWS
 |
VERIFY
 |
EVIDENCE
```

The frontend should consume normalized OSA cloud resources. Provider-specific APIs stay behind adapters.

## Normalized resource model

OSA-level concepts:

- COMPUTE
- CONTAINER_SERVICE
- DATABASE
- OBJECT_STORAGE
- SECRET
- IDENTITY
- BUILD
- DEPLOYMENT
- LOG
- COST

Provider mapping happens below the contract.

Examples:

```text
CONTAINER_SERVICE
GCP   -> Cloud Run
Azure -> Container Apps
AWS   -> App Runner / ECS
```

## Evidence contract

The existing rule remains unchanged:

> No evidence = UNKNOWN. No fake green lights.

Target provider-independent chain:

```text
SOURCE
  -> BUILD
  -> ARTIFACT
  -> DEPLOY
  -> RUNTIME
  -> HEALTHCHECK
  -> CONFIG CHECK
  -> COST OBSERVED
  -> EVIDENCE
```

Allowed top-level states:

- VERIFIED
- UNKNOWN
- FAILED
- BLOCKED

A provider reporting success is not sufficient by itself for VERIFIED.

## Provider phases

### GCP

Current production/home provider. Existing implementation remains untouched during the V3 structure phase.

### Azure — Phase 1

READ PARITY ONLY:

1. authentication
2. subscription discovery
3. resource groups
4. Container Apps
5. virtual machines
6. normalized status / region / URL
7. render through the existing Workspace UI

No mutation capability is part of Azure Phase 1.

### AWS

Reserved provider slot only. No implementation in this phase.

## Repository layout

```text
src/
  cloud/
    contract/
      provider.ts
      resources.ts
      deployment.ts
      evidence.ts
      costs.ts
    providers/
      gcp/
      azure/
      aws/
    registry.ts
    router.ts
  evidence/
    provenance.ts
    verifier.ts
    ledger.ts
```

The current `src/lib/gcp.ts` is intentionally not moved in this phase.

## Stop condition for this branch

This branch is structure/documentation only.

It must not:

- deploy anything,
- configure Azure,
- alter GCP runtime behavior,
- move or rewrite `src/lib/gcp.ts`,
- add Azure SDK calls,
- add AWS SDK calls,
- change production authentication,
- change existing API routes.

Implementation starts only after the provider contract is reviewed and locked.
