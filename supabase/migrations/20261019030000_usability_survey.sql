-- Usability test responses for the thesis (the in-app survey at /app/survey).
-- Each tester submits task results, the 10 standard System Usability Scale (SUS) answers,
-- and two open questions. The SUS score is computed here with the standard formula.
-- Testers can add and read only their own responses; the team reads all of them from the
-- SQL editor (which bypasses Row Level Security).

create table public.usability_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  participant_code text not null default '',     -- e.g. P07, given by the facilitator
  device text not null default '',                -- what they tested on, e.g. "Android phone"
  tasks jsonb not null default '{}',              -- { "add_pet": "done" | "help" | "failed", ... }
  sus smallint[] not null check (array_length(sus, 1) = 10 and 1 <= all (sus) and 5 >= all (sus)),
  -- SUS: odd items score (answer - 1), even items (5 - answer); the sum times 2.5 gives 0–100.
  sus_score numeric(5, 1) generated always as (
    ((sus[1] - 1) + (5 - sus[2]) + (sus[3] - 1) + (5 - sus[4]) + (sus[5] - 1)
     + (5 - sus[6]) + (sus[7] - 1) + (5 - sus[8]) + (sus[9] - 1) + (5 - sus[10])) * 2.5
  ) stored,
  liked text not null default '',
  improve text not null default '',
  created_at timestamptz not null default now()
);
create index usability_responses_user_id_idx on public.usability_responses (user_id);

alter table public.usability_responses enable row level security;
create policy "Add own response" on public.usability_responses for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Read own responses" on public.usability_responses for select to authenticated
  using (user_id = (select auth.uid()));

-- Results for the thesis (run in the SQL editor):
--
-- Overall SUS (68 is the usual average; above 80.3 is in the top 10%)
--   select count(*) as testers, round(avg(sus_score), 1) as mean_sus,
--          round(stddev_samp(sus_score), 1) as sd, min(sus_score), max(sus_score)
--   from public.usability_responses;
--
-- Task completion rate
--   select key as task,
--          count(*) filter (where value #>> '{}' = 'done')   as done_alone,
--          count(*) filter (where value #>> '{}' = 'help')   as needed_help,
--          count(*) filter (where value #>> '{}' = 'failed') as could_not,
--          round(100.0 * count(*) filter (where value #>> '{}' = 'done') / count(*), 1) as success_pct
--   from public.usability_responses, jsonb_each(tasks)
--   group by key order by success_pct;
--
-- Average answer per SUS statement (1 = strongly disagree … 5 = strongly agree)
--   select i as item, round(avg(sus[i]), 2) as mean_answer
--   from public.usability_responses, generate_series(1, 10) as i
--   group by i order by i;
--
-- Comments
--   select participant_code, device, sus_score, liked, improve from public.usability_responses order by created_at;
