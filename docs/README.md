# Top Token: documentation

## Read in this order

| Document | What it answers |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the Angular application is put together and why |
| [COMMERCE-FLOWS.md](COMMERCE-FLOWS.md) | What actually happens, end to end, when someone buys something |
| [API-CONTRACT.md](API-CONTRACT.md) | The versioned REST contract the frontend already consumes |
| [BACKEND-ARCHITECTURE.md](BACKEND-ARCHITECTURE.md) | The service to be built: layers, modules, stack, transactions |
| [DATABASE-DESIGN.md](DATABASE-DESIGN.md) | Conceptual schema, constraints and data-integrity invariants |
| [PAYMENT-ARCHITECTURE.md](PAYMENT-ARCHITECTURE.md) | Provider abstraction, intent lifecycle, webhooks, refunds |
| [FULFILLMENT-ARCHITECTURE.md](FULFILLMENT-ARCHITECTURE.md) | How a paid order becomes a delivered product |
| [SECURITY-ARCHITECTURE.md](SECURITY-ARCHITECTURE.md) | Threat model, auth, authorization, secrets, headers, audit |
| [COMPLIANCE.md](COMPLIANCE.md) | What a lawyer and an accountant must review before real money |
| [UPGRADE-PATH.md](UPGRADE-PATH.md) | Proposed Angular 16 → 20 upgrade, not yet performed |

## Point-in-time records

| Document | Written |
|---|---|
| [ARCHITECTURE-AUDIT.md](ARCHITECTURE-AUDIT.md) | Phase 1 — the state of the codebase before the rebuild |
| [SECURITY-REVIEW.md](SECURITY-REVIEW.md) | Phase 2 — what is *verified today*, each claim backed by a check |

## Status

The Angular storefront is complete and tested against an in-memory mock backend.

**There is no backend.** No database, no authentication, no payment provider, no
fulfillment integration. The documents above specify what to build; only
`ARCHITECTURE.md`, `ARCHITECTURE-AUDIT.md` and `SECURITY-REVIEW.md` describe
code that exists.

Nothing here is a claim of production readiness or legal compliance.

## Verifying the claims

```bash
npm run test:ci      # 157 unit tests
npm run qa:all       # routes, purchase flows, accessibility, security, performance
```

`qa/README.md` describes each harness.
