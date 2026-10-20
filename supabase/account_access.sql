create function public.my_access() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 uid uuid := (select auth.uid());
 sid uuid;
begin
 if uid is null then raise exception 'Sign in required'; end if;
 select id into sid from public.shops where owner_id=uid limit 1;
 return pg_catalog.jsonb_build_object('is_admin', private.is_admin(), 'shop_id', sid);
end; $$;
revoke all on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated;
