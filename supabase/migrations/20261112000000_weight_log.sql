-- Weight history: every weight a pet has had, so the health check and the AI see trends ("down from 4.8 kg in
-- March"), not only today's number. One row per pet per day (Philippine time).
-- pets.weight_kg stays the current weight. A trigger records it here whenever it's set or changed, so every client
-- logs weights the same way; owners can also add earlier weights (e.g. from a vet visit) straight into this table.
-- Apply by pasting into the Supabase SQL editor (the migration history is empty, so don't use `db push`).

create table public.weight_log (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  weighed_on date not null,
  weight_kg numeric(5, 2) not null check (weight_kg > 0),
  created_at timestamptz not null default now(),
  unique (pet_id, weighed_on)            -- also the index for looking up a pet's weights
);

alter table public.weight_log enable row level security;
create policy "Own pet records" on public.weight_log for all to authenticated
  using (pet_id in (select id from public.pets where owner_id = (select auth.uid())))
  with check (pet_id in (select id from public.pets where owner_id = (select auth.uid())));

-- Runs as the user who changed the pet (not security definer), so the policy above still applies.
create function public.log_pet_weight()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.weight_kg is not null and (tg_op = 'INSERT' or new.weight_kg is distinct from old.weight_kg) then
    insert into public.weight_log (pet_id, weighed_on, weight_kg)
    values (new.id, (now() at time zone 'Asia/Manila')::date, new.weight_kg)
    on conflict (pet_id, weighed_on) do update set weight_kg = excluded.weight_kg;
  end if;
  return new;
end;
$$;

create trigger log_pet_weight
  after insert or update of weight_kg on public.pets
  for each row execute function public.log_pet_weight();

-- Weights saved before this existed: logged on the day the pet was added (the only date known for them).
insert into public.weight_log (pet_id, weighed_on, weight_kg)
select id, (created_at at time zone 'Asia/Manila')::date, weight_kg
from public.pets
where weight_kg is not null
on conflict (pet_id, weighed_on) do nothing;

-- Live sync between devices, like the other pet tables.
alter publication supabase_realtime add table public.weight_log;
