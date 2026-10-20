# tabo

Mobile-first local food ordering. Customers discover independent food shops; **shops manage their own preparation, pickup, and optional deliveries**. Tabo does not collect payments or dispatch riders.

## Live app

- Web: https://tabo-web-rreno1s-projects.vercel.app/
- GitHub: https://github.com/rreno1/tabo
- Supabase: https://supabase.com/dashboard/project/rcbzjsqcrqvnhxxrivfs

This is an early MVP, with a real Supabase database and no seed data yet. The previous UI mockups remain in `mockups/`.

## Google sign-in (required for checkout)

1. In [Google Cloud Console](https://console.cloud.google.com/auth/overview), configure OAuth branding/audience and create an **OAuth Client ID → Web application**.
2. Add this exact **Authorized redirect URI** to the Google OAuth client:
   `https://rcbzjsqcrqvnhxxrivfs.supabase.co/auth/v1/callback`
3. In [Supabase Auth Providers](https://supabase.com/dashboard/project/rcbzjsqcrqvnhxxrivfs/auth/providers), enable **Google** and enter the Google OAuth client ID and **client secret**. Keep the secret in Supabase, not in GitHub or public client code.
4. In [Supabase Auth URL Configuration](https://supabase.com/dashboard/project/rcbzjsqcrqvnhxxrivfs/auth/url-configuration), set the site URL to `https://tabo-web-rreno1s-projects.vercel.app`. Add that same URL to the allowed redirect URLs (and any Vercel preview URLs you intentionally use).
5. To offer **Google sign-in only**, disable other sign-in providers (especially email/password) in the Supabase Auth settings.
6. Test "Sign in with Google" from the deployed site. After redirect, your user should appear in Supabase Authentication → Users.

The code calls `supabase.auth.signInWithOAuth({ provider: 'google' })` using the PKCE flow. **An OAuth login cannot be tested until you finish Google Cloud and Supabase provider setup.**

## Create your first administrator

Sign in with your intended admin Google account *first*. Then open Supabase SQL Editor and execute, substituting only your own Google email:

```sql
insert into private.admin_users(user_id)
select id from auth.users where email = 'your-google-email@example.com'
on conflict (user_id) do nothing;
```

The admin role is intentionally not self-service. Refresh the app after assigning it; an **Admin** tab will appear.

## Order workflow

1. Seller signs in with Google and submits a shop application.
2. Admin reviews the pending application.
3. Seller publishes menu items and opens their shop for orders.
4. Customer browses menus and adds items to a **single-shop** cart.
5. Customer signs in with Google before checkout, enters contact information, and selects a shop-supported fulfillment method.
6. Supabase `place_order` RPC creates an idempotent order with **server-validated prices, delivery fees and shop availability**.
7. Seller accepts, prepares, and marks the order ready for pickup or out for delivery; the seller later marks it completed.
8. Customer sees the order in **Orders**.

## Repository

- `index.html`, `styles.css`, `app.js`: production MVP static application.
- `config.js`: **publishable** Supabase client configuration only (not a secret).
- `supabase/initial_tabo_schema.sql`, `supabase/permissions_hardening.sql`, `supabase/account_access.sql`: ordered SQL changes applied to the new Supabase project.
- `mockups/`: earlier interactive customer/admin/seller design studies, not connected to the database.

## Security boundaries

- RLS on all exposed application tables.
- Customers can see their own orders; sellers can see orders for their own shop; administrators can review all.
- Direct order inserts/edits are denied; privileged server-side RPCs validate identity, seller ownership, status transitions, available items, delivery methods and prices.
- No service-role key or Google client secret should be placed in public files.
- Admin assignment is performed by a trusted operator using Supabase SQL Editor.

## Known limitations

- Google OAuth still requires manual provider setup.
- Database contains no shops/menu items; there is no fake production catalog.
- No image uploads/storage integration (optional HTTPS image URLs for now).
- No online payments, delivery tracking, dispatch, maps or push notifications.
- No automated end-to-end OAuth test has run yet.
