-- C-31 fix: block any non-admin from changing the `role` column on
-- their own (or anyone else's) profile. Service-role + direct DB
-- access bypass the check (auth.uid() is null) so admin tooling and
-- migrations still work.

create or replace function public.profiles_block_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
begin
  if (TG_OP = 'UPDATE' and (NEW.role is distinct from OLD.role)) then
    if auth.uid() is null then
      return NEW;
    end if;
    select role into caller_role
    from public.profiles
    where id = auth.uid();
    if caller_role is distinct from 'admin' then
      raise exception
        'Only admins can change profiles.role (caller % has role %)',
        auth.uid(), coalesce(caller_role, '<none>');
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_profiles_block_role_change on public.profiles;
create trigger trg_profiles_block_role_change
  before update on public.profiles
  for each row execute function public.profiles_block_role_change();
