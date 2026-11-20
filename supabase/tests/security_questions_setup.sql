-- Stand-in for Supabase, for supabase/tests/security_questions.sql (see there). Local PostgreSQL only.
-- A stand-in for what Supabase provides, just enough to run the migration: roles, the auth schema, pgcrypto.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema extensions;
create extension pgcrypto with schema extensions;
create table auth.users (id uuid primary key, email text, encrypted_password text, updated_at timestamptz, email_change text default '');
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users (id) on delete cascade);
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth, extensions to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
-- Supabase gives anon and authenticated every new table and function in public by default.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;

-- From 20261020000000_protect_shared_accounts.sql
create function public.is_shared_account(p_email text)
returns boolean language sql immutable set search_path = ''
as $$
  select lower(coalesce(p_email, '')) = 'demo@furfriends.app'
      or lower(coalesce(p_email, '')) like 'sample.%@example.com';
$$;

insert into auth.users (id, email, encrypted_password) values
  ('11111111-1111-1111-1111-111111111111', 'owner@example.com', extensions.crypt('oldpass123', extensions.gen_salt('bf'))),
  ('22222222-2222-2222-2222-222222222222', 'demo@furfriends.app', extensions.crypt('demopass1', extensions.gen_salt('bf'))),
  ('33333333-3333-3333-3333-333333333333', 'other@example.com', extensions.crypt('otherpass1', extensions.gen_salt('bf')));
insert into auth.sessions (user_id) values
  ('11111111-1111-1111-1111-111111111111'), ('11111111-1111-1111-1111-111111111111'), ('33333333-3333-3333-3333-333333333333');
