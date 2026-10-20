-- Supabase defaults can include explicit anon EXECUTE grants even after
-- revoking from PUBLIC. Revoke both sources of unauthenticated access.
revoke execute on function public.place_order(uuid,text,jsonb,text,text,text,uuid) from anon;
revoke execute on function public.update_shop_settings(uuid,text,text,boolean,boolean,boolean,integer) from anon;
revoke execute on function public.review_shop(uuid,text) from anon;
revoke execute on function public.change_order_status(uuid,text) from anon;
-- Preexisting public trigger helper should not be callable via Data API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
-- RLS policies on public tables call the private permission helper even
-- when querying with anon; it safely returns false for anonymous requests.
grant usage on schema private to anon;
grant execute on function private.is_admin() to anon;
