-- The assistant's chats, saved to the owner's account: one conversation per pet (and one about pets in general,
-- pet_id null), so owners can come back to them on any device. One row per message. "New chat" deletes that chat's
-- rows; deleting a pet or the account deletes its chats. The shared demo and sample accounts don't save chats.
-- Ratings stay in assistant_feedback (shared with the team only when an owner rates an answer).
-- Apply by pasting into the Supabase SQL editor (the migration history is empty, so don't use `db push`).

create table public.assistant_messages (
  id uuid primary key,                                    -- made by the app, so a message is saved once
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pet_id uuid references public.pets (id) on delete cascade,   -- null: the chat about pets in general
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 8000),
  meta jsonb not null default '{}'::jsonb,                -- what the chat shows with an answer: sources, model, rating
  created_at timestamptz not null default now()
);

create index assistant_messages_chat on public.assistant_messages (owner_id, pet_id, created_at);

alter table public.assistant_messages enable row level security;
create policy "Own chats" on public.assistant_messages for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (pet_id is null or pet_id in (select id from public.pets where owner_id = (select auth.uid())))
  );
