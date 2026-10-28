-- CPU time used by the FurFriends AI on Vercel (api/ask.py), so it stays inside Vercel's free plan.
-- The Hobby plan includes 4 CPU-hours per 30 days and pauses the whole account (the app too) past that,
-- so the function adds a row after each answer and stops answering above 3 hours (75%). Owners then get
-- the closest checked answer until older rows fall out of the 30 days.
-- People can add rows, not read or change them; any logged-in user can read the 30-day total.

create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cpu_seconds real not null check (cpu_seconds >= 0 and cpu_seconds < 600),
  model text,
  created_at timestamptz not null default now()
);
create index ai_usage_created_at_idx on public.ai_usage (created_at);

alter table public.ai_usage enable row level security;

create policy "Add own usage" on public.ai_usage for insert to authenticated
  with check (user_id = (select auth.uid()));

create function public.ai_cpu_seconds_30d() returns real
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(cpu_seconds), 0)::real from public.ai_usage where created_at > now() - interval '30 days'
$$;
revoke execute on function public.ai_cpu_seconds_30d() from public, anon;
grant execute on function public.ai_cpu_seconds_30d() to authenticated;

-- How much is used (run in the SQL editor):
--   select round(public.ai_cpu_seconds_30d() / 3600, 2) as cpu_hours_last_30_days;
--   select date(created_at), count(*) as answers, round(sum(cpu_seconds)) as cpu_seconds
--   from public.ai_usage group by 1 order by 1 desc;
