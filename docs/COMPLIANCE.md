# Top Token: compliance boundary

**This document is not legal advice, and nothing in this repository is a claim
of legal compliance.** It records what a professional must review before Top
Token takes real money, and how the architecture is built to support compliance
once those answers exist.

---

## 1. Status

| Question | Status |
|---|---|
| Is the platform legally compliant? | **Unknown. Not assessed.** |
| Has a lawyer reviewed the terms, privacy policy or refund policy? | **No.** They are engineer-written drafts and say so on the page |
| Has an accountant advised on VAT? | **No.** VAT is not modelled |
| Is there a merchant agreement? | **No.** No payment provider is connected |
| Are there supplier agreements? | **No.** |
| Are Sony/EA terms reviewed? | **No.** |

The current public build processes no money and collects no credentials, which
is why it can exist while these are open. **Every item below must be closed
before the first real transaction.**

## 2. Requires professional review

### 2.1 Israeli consumer protection
- Cancellation and refund rights for digital goods under חוק הגנת הצרכן, and
  where an already-revealed code sits within them
- Mandatory pre-contract disclosures and their placement
- Hebrew-language requirements for consumer-facing terms
- Price display rules: VAT-inclusive or exclusive, and how discounts are shown
- Distance-selling obligations

### 2.2 Payments and financial regulation
- Merchant account requirements for an Israeli entity
- PCI DSS scope. The architecture targets **SAQ-A** — card data never touches our
  systems — but the acquirer determines the actual scope
- Chargeback handling and evidence retention
- Whether reselling game currency implicates payment-services or e-money rules
- Anti-money-laundering thresholds, if any apply

### 2.3 Privacy
- Israeli Privacy Protection Law and the 2024 amendments (Amendment 13)
- Database registration obligations, if applicable
- GDPR exposure if EU customers are served
- Lawful basis for processing; marketing consent must be explicit and recorded
  (the schema has `marketing_consent` + `marketing_consent_at`)
- Data subject rights, and the tension between erasure and the bookkeeping
  retention below
- Data processing agreements with every processor (payment, email, hosting)
- **Google Fonts is currently loaded from Google's servers**, sending every
  visitor's IP to a third party. Flagged in `docs/SECURITY-REVIEW.md`; self-host
  before launch

### 2.4 Tax
- VAT treatment of digital goods sold to Israeli consumers
- VAT on sales to customers outside Israel
- Invoice/receipt requirements (חשבונית מס), format and delivery
- Bookkeeping retention — assumed 7 years in `docs/DATABASE-DESIGN.md` §12,
  **to be confirmed**

### 2.5 Third-party platform terms
- **Sony / PlayStation:** whether reselling PSN gift cards and PS Plus codes is
  permitted, from which suppliers, with which region restrictions
- **EA / EA SPORTS FC:** EA's position on coin sales and account services. This
  is the highest-risk category commercially and the one most likely to be
  restricted by publisher terms
- **Epic, Activision, 2K:** equivalent review per product line
- Supplier agreements: provenance of codes, warranty, replacement, liability
- Trademark use: how publisher names and marks may appear in the storefront

### 2.6 Operational
- Terms of service, privacy policy, refund policy — all currently drafts
- Accessibility: Israeli Standard 5568 / WCAG 2.1 AA. The frontend is built for
  it and mechanically checked, but **no formal audit or screen-reader pass has
  been done**
- Age restrictions and minors' purchases
- Marketing and spam rules (חוק הספאם) for transactional vs promotional email

## 3. How the architecture supports compliance

Design decisions already made that a compliance review will need:

| Requirement | Support |
|---|---|
| Prove what a customer was charged | Immutable `pricing_snapshot` on session and order; prices and names copied to `order_items` |
| Prove what was disclosed before purchase | Region, delivery method and ETA are offer fields, snapshotted into the order |
| Prove consent | `TERMS_ACCEPTANCE` and `REGION_CONFIRMATION` recorded in `checkout_values`; marketing consent timestamped |
| Audit trail | Append-only `audit_logs` with actor, before/after state, request id |
| Data minimisation | No passwords, no card data, no credentials; `localStorage` holds only cart intentions |
| Right to erasure vs bookkeeping | Anonymise the customer, retain financial rows against a tombstoned reference — **needs legal sign-off** |
| Refund limits | `orders_refund_within_total` constraint |
| Honest delivery claims | ETA is optional and omitted rather than guessed; `AUTOMATED_API` is unusable without a real integration |
| No credential collection | Closed `CheckoutFieldKey` vocabulary, enforced on both sides |

## 4. Explicitly not claimed

- Not PCI DSS certified or assessed
- Not privacy-law compliant
- Not accessibility-audited
- Not authorised by Sony, EA, Epic, Activision or 2K
- No supplier relationships
- No legal review of any customer-facing document

## 5. Before the first real transaction

1. Legal review of terms, privacy and refund policy
2. Accountant on VAT and invoicing
3. Merchant agreement and PCI scope confirmation
4. Supplier agreements for every product line sold
5. Publisher-terms review per game category
6. Privacy: DPAs, consent flows, database registration if required
7. Accessibility audit against IS 5568
8. Self-host fonts; add CSP and security headers
9. Penetration test covering the plan in `docs/SECURITY-ARCHITECTURE.md` §14

**Engineering cannot close any of items 1–7.** They require professionals.
