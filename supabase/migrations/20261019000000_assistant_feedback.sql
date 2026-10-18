-- Ratings on the AI assistant's answers (thesis pilot).
-- Each row keeps the question, the answer, the earlier messages and the pet details the model
-- saw, so the team can measure accuracy per model version and reuse rated answers when retraining.
-- People can add, change and remove their own ratings. The team reads all rows from the
-- Supabase dashboard or with the service key, which both bypass Row Level Security.

create table public.assistant_feedback (
  id uuid primary key,                   -- made by the app, one per answer
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pet_id uuid references public.pets (id) on delete set null,
  question text not null,
  answer text not null,
  conversation jsonb not null default '[]',  -- earlier messages sent with the question: [{ role, content }]
  pet_context jsonb,                     -- the pet summary sent with the question (null for general questions)
  model text,                            -- version label the assistant server returned, if any
  rating smallint not null check (rating in (-1, 1)),  -- 1 = helpful, -1 = not helpful
  reason text,                           -- quick pick when not helpful, e.g. 'Wrong or inaccurate'
  comment text not null default '',      -- what the answer should have said
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assistant_feedback_user_id_idx on public.assistant_feedback (user_id);
create index assistant_feedback_model_idx on public.assistant_feedback (model, rating);

alter table public.assistant_feedback enable row level security;

create policy "Own feedback" on public.assistant_feedback for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (pet_id is null or pet_id in (select id from public.pets where owner_id = (select auth.uid())))
  );

-- Useful queries for the thesis (run in the SQL editor):
--
-- Helpful rate per model version
--   select model, count(*) as rated,
--          round(100.0 * avg((rating = 1)::int), 1) as helpful_pct
--   from public.assistant_feedback group by model order by model;
--
-- Why answers were marked not helpful
--   select reason, count(*) from public.assistant_feedback
--   where rating = -1 group by reason order by 2 desc;
--
-- Corrections to review before retraining
--   select question, answer, reason, comment, pet_context from public.assistant_feedback
--   where rating = -1 and comment <> '' order by created_at desc;
