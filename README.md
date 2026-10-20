# tabo

A mobile-first local food ordering platform. Tabo connects customers with independent food shops; **each shop handles food preparation and decides whether to offer pickup, its own delivery, or both.**

## Current status

The interactive prototypes are preserved under `mockups/` while the production app and Supabase schema are designed. These prototypes use demonstration data and **are not connected to the database**.

- `mockups/customer.html` — customer discovery, item details, cart, pickup/delivery, checkout flow.
- `mockups/admin-seller.html` — admin and seller management workspaces.

## MVP scope

- **Customer:** browse shops and menu items; add to cart; submit an order to one shop; view order status.
- **Seller:** manage shop details, availability, menu, order status, and pickup/shop-delivery settings.
- **Admin:** manage shop approvals and platform oversight.
- **Not in scope:** platform riders/dispatch, live maps, payment gateways, platform-managed deliveries, or complex external integrations.
- **Payment responsibility:** customers pay the shop according to its accepted payment methods.

## Stack direction

- Frontend: mobile-first web application.
- Backend: Supabase Postgres, Auth, and Storage, with row-level security.
- Source control: this GitHub repository.
- Hosting: Vercel (to be configured after the application is implemented).

### Supabase

New project: `rcbzjsqcrqvnhxxrivfs` (Tokyo region).

**Do not commit secret/service-role keys to this repository.** Only public/publishable keys can be used in a browser client with properly enforced RLS.

## Next decision

Choose **guest checkout** versus **authenticated checkout** before implementing order placement, customer records, and authorization.

## Status

This repository currently contains interactive prototypes, not a production-ready ordering service.
