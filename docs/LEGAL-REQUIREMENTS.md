# ZuzCOINS: Israeli regulatory requirements

Research notes and an inventory of what the business owner must supply before
the store takes real money.

**This is not legal advice.** It was gathered from public sources by an engineer.
Every item below needs a lawyer's confirmation, and several cannot be answered
without facts only the business owner has.

## Consumer protection: remote sales

Source: Consumer Protection Law 5741-1981 (חוק הגנת הצרכן), the remote-sale
provisions, and the Israel Consumer Council's guidance on
[עסקאות מכר מרחוק](https://www.consumers.org.il/category/remote-purchase).

A seller selling remotely must disclose, before the transaction:

| Requirement | Status in the product |
|---|---|
| Seller's name and company or business number | **Missing.** `/business-details` exists and lists what is needed |
| Postal address for correspondence | **Missing** |
| Main characteristics of the goods or service | Present: platform, region, delivery method and terms on every offer |
| Price and payment terms | Present. The displayed price is binding, and it is server-authoritative |
| Cancellation rights and how to exercise them | Draft at `/refund-policy`, **needs legal review** |
| Delivery or service details | Draft at `/delivery`, **needs binding delivery times from the owner** |
| Warranty terms where applicable | **Not written** |

A displayed price binds the seller. Our pricing is computed server-side from the
catalog and cannot be altered by the browser, which supports this rather than
undermining it.

**Open question for a lawyer:** how the statutory cancellation right applies to a
digital product that has already been delivered and consumed, such as a redeemed
code or coins transferred in-game. This is the single most commercially
significant unanswered question, and it needs an answer before launch.

## Privacy

Sources: Privacy Protection Law and **Amendment 13**, which came into effect on
**14 August 2025**, and commentary on its effect on e-commerce operators.

What changed that matters here:

- Broader powers for the Privacy Protection Authority and materially larger
  penalties.
- Some organisations must appoint a **privacy officer**, and some an
  **information security officer**. Whether ZuzCOINS crosses those thresholds
  depends on data volume and business structure. **Needs a determination.**
- Strengthened information-security obligations for websites, including
  responsibility for the vendors that process data on your behalf.
- The obligation to register databases was narrowed.

What the product already does: collects the minimum needed to deliver an order
(name, email, sometimes phone, sometimes a public in-game handle), never asks for
a password, 2FA code or recovery code, never stores card data, and hashes session
tokens at rest.

**Still required:** a privacy notice that accurately describes what is collected,
why, how long it is kept and who it is shared with. The current `/privacy` page
is an engineering draft. It cannot be finalised until the payment provider, the
mail provider and any analytics are actually chosen, because those are the third
parties that must be named.

## Accessibility

Sources: Equal Rights for Persons with Disabilities Law and its service
accessibility regulations, which have required websites serving the public to
meet **Israeli Standard 5568** since 2013. IS 5568 is based on WCAG 2.0 level AA.

| Requirement | Status |
|---|---|
| Published accessibility statement | Present at `/accessibility`, and it states honestly what has not been done |
| Semantic structure, headings, landmarks | Implemented, verified by the automated suite |
| Full keyboard navigation and visible focus | Implemented |
| Contrast | Palette chosen against the dark ground; automated checks pass |
| Alternative text | Implemented |
| Reduced-motion support | Implemented globally |
| **External audit against IS 5568** | **Not done.** Required |
| **Screen-reader testing with real users** | **Not done.** Required |

An accessibility overlay widget is not a substitute for an accessible site, and
none is used here.

## Tax and transaction documentation

**Not researched to a conclusion, and deliberately not guessed at.** An Israeli
seller has obligations around invoices and receipts, and Israel has been rolling
out a digital-invoice allocation-number regime for higher-value transactions.
The thresholds and timing change, and getting them wrong has real consequences.

**Accountant required** to answer: what document the customer must receive and
when, whether allocation numbers apply at our transaction sizes, and how VAT is
presented on displayed prices.

Nothing in the product currently issues an invoice or receipt. That is a gap for
the phase that connects a real payment provider.

## What the business owner must supply

Nothing below can be invented, and each blocks a page that is otherwise built:

1. Registered business or company name
2. Business number (עוסק מורשה / ח.פ.)
3. Registered postal address
4. Customer-service phone and email, and service hours
5. Name of the person responsible for consumer enquiries
6. Binding delivery time per fulfillment method
7. Procedure when an order is delayed or cannot be fulfilled
8. The cancellation and refund policy the lawyer approves
9. Decision on whether a privacy officer or information-security officer is required
10. Chosen payment provider, mail provider and analytics, so the privacy notice can name them
11. Accountant's answer on invoices, receipts and VAT presentation
12. Trademark clearance on the ZuzCOINS name (see `BRAND-AND-ASSETS.md`)

## Claims the product deliberately does not make

Competitors in this market advertise figures such as "18+ billion coins
delivered", "1000+ satisfied customers", "100% guarantee" and explicit
ban-protection promises.

None appear here, because none is backed by data this system holds. The trust
section states only what the platform actually does: it does not ask for
passwords, it shows the store region before payment, it shows an estimated
delivery time per product, and support answers in Hebrew.

The structure exists to display real figures the moment there are real figures.
Fabricating them would be both a consumer-protection exposure and the fastest way
to lose the trust the design is trying to earn.
