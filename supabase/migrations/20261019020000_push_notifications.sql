-- Reminder notifications that arrive even when the app is closed (web push).
--
-- Setup, once:
--   1. Run this file in the SQL editor.
--   2. Run supabase/push-setup.local.sql (made on the developer's machine, not committed):
--      it stores the project URL and the cron secret in Vault for the schedule below.
--   3. Deploy the function and its secrets:
--        npx supabase login
--        npx supabase link --project-ref <your project ref>
--        npx supabase secrets set --env-file supabase/.env.push.local
--        npx supabase functions deploy send-reminders --no-verify-jwt
--      (--no-verify-jwt because the schedule authenticates with CRON_SECRET instead.)

/* ---------------------------------------------------------------- devices */
-- One row per browser or installed app that allowed notifications.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,          -- the push service address for this device
  p256dh text not null,                   -- encryption keys from the browser
  auth text not null,
  timezone text not null default 'Asia/Manila',  -- reminders use the device's local time
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  last_sent_at timestamptz
);
create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
create policy "Own devices" on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

-- Saving goes through these functions: a device that changes account must be able to move
-- its row to the new user, which plain RLS wouldn't allow.
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_timezone text, p_user_agent text)
returns void
language sql
security definer set search_path = ''
as $$
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, timezone, user_agent)
  values ((select auth.uid()), p_endpoint, p_p256dh, p_auth, coalesce(nullif(p_timezone, ''), 'Asia/Manila'), coalesce(p_user_agent, ''))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        timezone = excluded.timezone, user_agent = excluded.user_agent;
$$;

create function public.remove_push_subscription(p_endpoint text)
returns void
language sql
security definer set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = (select auth.uid());
$$;

revoke execute on function public.save_push_subscription(text, text, text, text, text) from public, anon;
revoke execute on function public.remove_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text, text) to authenticated;
grant execute on function public.remove_push_subscription(text) to authenticated;

/* ---------------------------------------------------------------- sent log */
-- Which reminders were already pushed, so each one is sent once. Only the Edge Function
-- (service role) reads and writes it, so there are no policies.
create table public.push_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,                      -- same key the app uses, e.g. feed-<pet>-<meal>-<date>
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.push_log enable row level security;

/* ---------------------------------------------------------------- schedule */
-- Call the send-reminders function every 5 minutes.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('send-reminders', '*/5 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
$$);
