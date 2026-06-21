-- Add `super_admin` as a recognised role on profiles.role and protect
-- the assigned row from being demoted by anyone going through the
-- regular admin UI.
--
-- Hierarchy:
--   customer    — default for every signup
--   admin       — full access to /admin/* surfaces. Grantable + revocable
--                 via the new /admin/users page.
--   super_admin — same access as admin + immune to demotion by any
--                 other admin. Cannot be granted via the UI; only via
--                 direct SQL (which deliberately requires bypassing
--                 the trigger below for safety).

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('customer', 'admin', 'super_admin'));

update public.profiles
   set role = 'super_admin',
       updated_at = now()
 where id = '18e15df5-2ccd-43b8-8a29-3bb842998e47'
   and role <> 'super_admin';

create or replace function public.guard_super_admin_role()
returns trigger
language plpgsql
as $function$
begin
  if old.role = 'super_admin' and new.role is distinct from 'super_admin' then
    raise exception 'cannot change role away from super_admin (profile %)', old.id
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists profiles_guard_super_admin on public.profiles;
create trigger profiles_guard_super_admin
  before update of role on public.profiles
  for each row
  execute function public.guard_super_admin_role();
