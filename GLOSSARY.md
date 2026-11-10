# Glossary

Canonical product vocabulary. The full user-facing rules are in
`docs/TERMINOLOGY.md`; this file is the short working glossary for agents.

## Core objects

| Term | Meaning | Do not use |
|---|---|---|
| **Restaurant** | Tenant/business account | Store, outlet |
| **Table** | A physical table in a restaurant | Desk |
| **Dining session** | One sitting at a table; code/API may use `DiningSession` | Table session in UI |
| **Bill** | The table’s current amount due | Check, tab |
| **Order** | A customer order/round | Ticket (for a customer order) |
| **Item** | A line in an order | Product, line item |
| **Kitchen ticket** | A kitchen print artifact | Order |
| **Payment** | Money taken | Checkout, settlement |
| **Receipt** | Proof after payment | Bill |
| **Station** | A named work area, e.g. Grill/Drinks | Kitchen (as a generic station) |
| **Device** | A provisioned phone/tablet bound to a station | User |
| **Counter** | The Android POS/cashier app | Web POS |
| **Kitchen / Station app** | The Android kitchen display app | Counter |

## Status vocabulary

### Order status

| Backend | UI label |
|---|---|
| `PENDING` | **Pending** |
| `CONFIRMED` | **Confirmed** |
| `PREPARING` | **Preparing** |
| `READY` | **Ready** |
| `SERVED` | **Served** |
| `CANCELLED` | **Cancelled** |

Do not use: Cooking, In progress (as a status pill), Ready for Pickup for
dine-in, Delivered for a table order, Canceled.

### Payment status

| Backend | UI label |
|---|---|
| `PENDING` | **Unpaid** |
| `PAID` | **Paid** |
| `REFUNDED` | **Refunded** |
| `FAILED` | **Failed** |

Rule: **Pending is an order state. Unpaid is a payment state.**

### Payment methods

| Backend | UI label |
|---|---|
| `cash` | **Cash** |
| `card` | **Card** |
| `ewallet` | **E-Wallet** |

## State families

Do not mix these in one badge:

- **Table state:** Available, Occupied, Reserved, Inactive.
- **Bill state:** Unpaid, Paid, Ready to clear.
- **Table attention:** TO SERVE.

## Naming rules

- Use the glossary term in UI copy, code identifiers, API fields, and tests.
- Do not use synonyms for variety.
- Code and API may use `DiningSession`; UI says **Bill**.
- A customer order is an **Order**; a kitchen print job is a **Kitchen ticket**.
- Update this file and `docs/TERMINOLOGY.md` when a term changes.
