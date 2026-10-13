# Data model decisions (MongoDB / Mongoose)

| Spec model | Implementation | Why |
|---|---|---|
| User, Address | `User` with embedded `addresses[]` (max 10) | Addresses are only read with their user; bounded array. |
| Category | `Category` (`parent` ObjectId for subcategories) | One level of nesting; slugs + `slugHistory` for redirects. |
| Product, ProductVariant | `Product` with embedded `variants[]` (max 50) | Variants are always read/written with the product; atomic `$inc` on `variants.$.stock` keeps stock changes single-document. |
| Cart | Browser `localStorage` + server-side `/cart/quote` | The cart holds no authority: every price/discount/shipping figure is recomputed on the server at quote time and again at checkout. No cart documents to clean up. |
| Wishlist | `Wishlist` (one doc per user, max 200 refs) | |
| Order, OrderItem | `Order` with **embedded immutable item snapshots** (name, SKU, image, unit price, quantity) | Later product edits never change past orders. |
| PaymentAttempt, PaymentEvidence, PaymentVerification | `PaymentAttempt` with embedded `evidence[]` (max 5) and a `decision` sub-document | Evidence and decision belong to exactly one attempt; a rejection creates a *new* attempt on resubmission so history is preserved. Evidence files are in **private** storage; the DB holds only the storage key. |
| OrderStatusHistory | Separate collection | One row per payment/fulfilment transition, queried by order. |
| Coupon, CouponUsage | Two collections | Usage rows enable per-customer limits and release on cancellation. `usedCount` uses a conditional atomic update. |
| ShippingZone, ShippingMethod | `ShippingZone` with embedded `methods[]` | |
| InventoryMovement | Separate collection | Append-only audit of every stock change. |
| Notification, AuditLog | Separate collections | Notification rows record the *real* outcome (`sent` / `failed` / `skipped_not_configured`). |
| FAQ, WebsiteContent, PolicyVersion, StoreSettings | As named | `WebsiteContent` has `draft` + `published`; `PolicyVersion` is versioned and published versions are immutable. |

## Inventory strategy
`stock` = units available to sell; `reserved` = units held by unpaid orders.
* Order placed → conditional atomic `updateOne` (`stock >= qty`) moves units `stock → reserved`. If any line fails, earlier lines are compensated and the order is rejected with `OUT_OF_STOCK`.
* Payment approved (or COD confirmed) → reservation is committed; `soldCount` increments.
* Cancel / auto-expiry (`reservationHours`, default 48 h) → units return to `stock` exactly once (guarded by `order.inventoryState`).

## Transactions
On Atlas (replica set), multi-document steps run in `withTransaction`. On a standalone server they run without one, relying on atomic single-document updates and explicit compensation (`withOptionalTransaction`, `cleanupFailedOrder`).

## Guest order access
`trackingToken = HMAC-SHA256(JWT_SECRET, "track:" + orderNumber)`; only its SHA-256 is stored. Tracking needs **order number + token**. Rotating `JWT_SECRET` invalidates old tracking links (customers can still use their account).
