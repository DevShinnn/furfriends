-- Protect the shared demo and sample accounts (docs/sample-accounts.md).
-- Their passwords are published in the repo, so the app already refuses to change their password
-- or email, or to save survey answers and assistant ratings from them. This makes the database
-- refuse too, so nobody can lock everyone out of the demo, or add made-up rows to the research
-- data, by calling the API directly.
--
-- To change one of these accounts' passwords on purpose, run this in the SQL editor (it runs as
-- "postgres", which the check below lets through):
--   update auth.users set encrypted_password = extensions.crypt('new password', extensions.gen_salt('bf'))
--   where email = 'demo@furfriends.app';

create function public.is_shared_account(p_email text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(p_email, '')) = 'demo@furfriends.app'
      or lower(coalesce(p_email, '')) like 'sample.%@example.com';
$$;

/* ---------------------------------------------------------------- password and email */
create function public.protect_shared_account()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if public.is_shared_account(old.email) and current_user <> 'postgres'
     and (new.encrypted_password is distinct from old.encrypted_password
          or new.email is distinct from old.email
          or coalesce(new.email_change, '') <> '') then
    raise exception 'This shared FurFriends account can''t change its password or email.';
  end if;
  return new;
end;
$$;

create trigger protect_shared_account
  before update on auth.users
  for each row execute function public.protect_shared_account();

/* ---------------------------------------------------------------- research data */
-- Survey answers and assistant ratings only from real testers' own accounts.
drop policy "Add own response" on public.usability_responses;
create policy "Add own response" on public.usability_responses for insert to authenticated
  with check (user_id = (select auth.uid()) and not public.is_shared_account((select auth.jwt()) ->> 'email'));

drop policy "Own feedback" on public.assistant_feedback;
create policy "Own feedback" on public.assistant_feedback for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and not public.is_shared_account((select auth.jwt()) ->> 'email')
    and (pet_id is null or pet_id in (select id from public.pets where owner_id = (select auth.uid())))
  );
