-- Forgot password without email. Each owner picks a security question and answer; "Forgot password?" on the log-in
-- page asks for the email, shows that account's question, and sets a new password when the answer matches. No email
-- is sent: the project has no email service.
--
--   * The answer is kept only as a bcrypt hash of its trimmed, lowercase, single-spaced form ("Sta. Rosa  Elem" and
--     "sta. rosa elem" are the same answer). Nobody can read the table through the API (no policies): only the
--     functions below use it.
--   * 5 wrong answers lock that account's reset for 15 minutes.
--   * Setting or changing the question needs the account's current password.
--   * The shared demo and sample accounts (public passwords, docs/sample-accounts.md) can't have a question, so nobody
--     can reset them; protect_shared_account (20261020000000) refuses any password change for them anyway.
--   * After a reset, the account is logged out on its other devices.
-- The app hides the feature until this is applied. Run it in Supabase → SQL Editor.

create extension if not exists pgcrypto with schema extensions;

create table public.security_questions (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  question text not null check (char_length(question) between 5 and 200),
  answer_hash text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.security_questions enable row level security;
revoke all on public.security_questions from anon, authenticated;

/* ---------------------------------------------------------------- the owner's own question (logged in) */
-- Sets or changes this account's question. Raises with a message the app shows.
create function public.set_security_question(p_question text, p_answer text, p_password text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_email text;
  v_hash text;
  v_question text := btrim(coalesce(p_question, ''));
  v_answer text := lower(regexp_replace(btrim(coalesce(p_answer, '')), '\s+', ' ', 'g'));
begin
  select id, email, encrypted_password into v_id, v_email, v_hash from auth.users where id = auth.uid();
  if v_id is null then
    raise exception 'Please log in first.';
  end if;
  if public.is_shared_account(v_email) then
    raise exception 'This shared account can''t have a security question.';
  end if;
  if coalesce(v_hash, '') = '' or extensions.crypt(coalesce(p_password, ''), v_hash) <> v_hash then
    raise exception 'Your password is incorrect.';
  end if;
  if char_length(v_question) not between 5 and 200 then
    raise exception 'Please choose a question.';
  end if;
  if char_length(v_answer) < 2 then
    raise exception 'Please type an answer of at least 2 characters.';
  end if;
  insert into public.security_questions (owner_id, question, answer_hash)
  values (v_id, v_question, extensions.crypt(v_answer, extensions.gen_salt('bf', 10)))
  on conflict (owner_id) do update
    set question = excluded.question, answer_hash = excluded.answer_hash,
        failed_attempts = 0, locked_until = null, updated_at = now();
end;
$$;

-- This account's question, or null if it has none.
create function public.my_security_question()
returns text
language sql
stable
security definer set search_path = ''
as $$
  select question from public.security_questions where owner_id = auth.uid();
$$;

/* ---------------------------------------------------------------- forgot password (not logged in) */
-- The question to show for an email, or null: no such account, no question, or a shared account.
create function public.security_question_for(p_email text)
returns text
language sql
stable
security definer set search_path = ''
as $$
  select q.question
  from auth.users u
  join public.security_questions q on q.owner_id = u.id
  where lower(u.email) = lower(btrim(coalesce(p_email, '')))
    and not public.is_shared_account(u.email)
  limit 1;
$$;

-- Sets a new password when the answer matches. Never raises for a wrong answer (that would undo the count); returns
--   {"ok": true}
--   {"ok": false, "error": "no_question"}             no such account, no question, or a shared account
--   {"ok": false, "error": "short"}                   the new password has fewer than 8 characters
--   {"ok": false, "error": "wrong", "left": 4}        wrong answer: tries left before the lock
--   {"ok": false, "error": "locked", "minutes": 15}   too many wrong answers: wait this long
create function public.reset_password_with_answer(p_email text, p_answer text, p_new_password text)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_hash text;
  v_failed int;
  v_locked timestamptz;
  v_answer text := lower(regexp_replace(btrim(coalesce(p_answer, '')), '\s+', ' ', 'g'));
begin
  select u.id into v_id
  from auth.users u
  where lower(u.email) = lower(btrim(coalesce(p_email, ''))) and not public.is_shared_account(u.email)
  limit 1;
  select answer_hash, failed_attempts, locked_until into v_hash, v_failed, v_locked
  from public.security_questions
  where owner_id = v_id
  for update;
  if v_hash is null then
    return jsonb_build_object('ok', false, 'error', 'no_question');
  end if;
  if v_locked > now() then
    return jsonb_build_object('ok', false, 'error', 'locked', 'minutes', ceil(extract(epoch from v_locked - now()) / 60)::int);
  end if;
  if char_length(coalesce(p_new_password, '')) < 8 then
    return jsonb_build_object('ok', false, 'error', 'short');
  end if;
  if extensions.crypt(v_answer, v_hash) <> v_hash then
    if v_failed + 1 >= 5 then
      update public.security_questions set failed_attempts = 0, locked_until = now() + interval '15 minutes' where owner_id = v_id;
      return jsonb_build_object('ok', false, 'error', 'locked', 'minutes', 15);
    end if;
    update public.security_questions set failed_attempts = v_failed + 1 where owner_id = v_id;
    return jsonb_build_object('ok', false, 'error', 'wrong', 'left', 5 - (v_failed + 1));
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)), updated_at = now()
  where id = v_id;
  update public.security_questions set failed_attempts = 0, locked_until = null where owner_id = v_id;
  -- Log the account out on its other devices. Best effort: if Supabase changes its auth tables, the reset still works.
  begin
    delete from auth.sessions where user_id = v_id;
  exception when others then
    null;
  end;
  return jsonb_build_object('ok', true);
end;
$$;

/* ---------------------------------------------------------------- who may call what */
revoke all on function public.set_security_question(text, text, text) from public, anon;
revoke all on function public.my_security_question() from public, anon;
revoke all on function public.security_question_for(text) from public;
revoke all on function public.reset_password_with_answer(text, text, text) from public;
grant execute on function public.set_security_question(text, text, text) to authenticated;
grant execute on function public.my_security_question() to authenticated;
grant execute on function public.security_question_for(text) to anon, authenticated;
grant execute on function public.reset_password_with_answer(text, text, text) to anon, authenticated;
