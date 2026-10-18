-- FurFriends initial schema.
-- Mirrors the app's current data model (src/store/StoreContext.jsx).
-- Auth is handled by Supabase Auth (auth.users); every row is owned by one user
-- and Row Level Security keeps each user's data private.

/* ---------------------------------------------------------------- profiles */
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  phone text not null default '',
  city text not null default '',
  notifications_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- Create a profile row automatically when someone signs up.
-- The sign-up form passes { name } in options.data (raw_user_meta_data).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

/* ---------------------------------------------------------------- pets */
create table public.pets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  species text not null check (species in ('Cat', 'Dog')),
  breed text not null default '',
  age_years smallint not null default 0 check (age_years >= 0),
  age_months smallint not null default 0 check (age_months between 0 and 11),
  gender text check (gender in ('Female', 'Male')),
  weight_kg numeric(5, 2) check (weight_kg > 0),
  photo_path text,                       -- object path in the 'pet-photos' bucket
  created_at timestamptz not null default now()
);
create index pets_owner_id_idx on public.pets (owner_id);

/* ---------------------------------------------------------------- health records */
create table public.medical_records (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  date date not null,
  type text not null check (type in ('Checkup', 'Illness', 'Injury', 'Surgery', 'Medication', 'Allergy', 'Other')),
  title text not null,
  vet text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index medical_records_pet_id_idx on public.medical_records (pet_id);

create table public.vaccinations (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  name text not null,
  date_given date not null,
  next_due date check (next_due is null or next_due > date_given),
  vet text not null default '',
  lot text not null default '',
  created_at timestamptz not null default now()
);
create index vaccinations_pet_id_idx on public.vaccinations (pet_id);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  title text not null,
  type text not null default 'Other',
  date date not null default current_date,
  notes text not null default '',
  file_path text not null,               -- object path in the 'pet-documents' bucket
  mime_type text not null default 'image/jpeg',  -- images or application/pdf
  created_at timestamptz not null default now()
);
create index documents_pet_id_idx on public.documents (pet_id);

/* ---------------------------------------------------------------- feeding & care */
create table public.feeding_schedules (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  time time not null,
  food text not null,
  amount text not null default '',
  days smallint[] not null default '{}', -- 0 = Sun … 6 = Sat; empty = every day
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index feeding_schedules_pet_id_idx on public.feeding_schedules (pet_id);

-- One row per meal ticked as fed on a given day (replaces the in-browser fedLog).
create table public.feeding_log (
  feeding_id uuid not null references public.feeding_schedules (id) on delete cascade,
  pet_id uuid not null references public.pets (id) on delete cascade,
  fed_on date not null,
  primary key (feeding_id, fed_on)
);
create index feeding_log_pet_id_idx on public.feeding_log (pet_id, fed_on);

-- Grooming / deworming / vaccination reminders, plus vet appointments.
create table public.care_tasks (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  kind text not null check (kind in ('Grooming', 'Deworming', 'Vaccination', 'Vet appointment')),
  title text not null,
  next_due date not null,
  due_time time,                         -- optional, mainly for vet appointments
  repeat_days integer not null default 0 check (repeat_days >= 0), -- 0 = does not repeat
  last_done date,
  done boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index care_tasks_pet_id_idx on public.care_tasks (pet_id);

/* ---------------------------------------------------------------- row level security */
alter table public.profiles enable row level security;
alter table public.pets enable row level security;
alter table public.medical_records enable row level security;
alter table public.vaccinations enable row level security;
alter table public.documents enable row level security;
alter table public.feeding_schedules enable row level security;
alter table public.feeding_log enable row level security;
alter table public.care_tasks enable row level security;

create policy "Own profile" on public.profiles
  for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "Own pets" on public.pets
  for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Child tables: allowed when the row's pet belongs to the current user.
create policy "Own pet records" on public.medical_records for all to authenticated
  using (pet_id in (select id from public.pets where owner_id = (select auth.uid())))
  with check (pet_id in (select id from public.pets where owner_id = (select auth.uid())));
create policy "Own pet records" on public.vaccinations for all to authenticated
  using (pet_id in (select id from public.pets where owner_id = (select auth.uid())))
  with check (pet_id in (select id from public.pets where owner_id = (select auth.uid())));
create policy "Own pet records" on public.documents for all to authenticated
  using (pet_id in (select id from public.pets where owner_id = (select auth.uid())))
  with check (pet_id in (select id from public.pets where owner_id = (select auth.uid())));
create policy "Own pet records" on public.feeding_schedules for all to authenticated
  using (pet_id in (select id from public.pets where owner_id = (select auth.uid())))
  with check (pet_id in (select id from public.pets where owner_id = (select auth.uid())));
create policy "Own pet records" on public.feeding_log for all to authenticated
  using (pet_id in (select id from public.pets where owner_id = (select auth.uid())))
  with check (pet_id in (select id from public.pets where owner_id = (select auth.uid())));
create policy "Own pet records" on public.care_tasks for all to authenticated
  using (pet_id in (select id from public.pets where owner_id = (select auth.uid())))
  with check (pet_id in (select id from public.pets where owner_id = (select auth.uid())));

/* ---------------------------------------------------------------- file storage */
-- Private buckets. Files are stored under "<user id>/<pet id>/<file>", so the
-- first folder in the path decides who may read or write it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('pet-photos', 'pet-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('pet-documents', 'pet-documents', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

create policy "Own pet files" on storage.objects for all to authenticated
  using (bucket_id in ('pet-photos', 'pet-documents') and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id in ('pet-photos', 'pet-documents') and (storage.foldername(name))[1] = (select auth.uid())::text);
