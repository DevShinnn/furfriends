-- Clinic finder: nearby vet clinics with directions and opening hours (src/pages/Clinics.jsx).
-- Clinics come from TomTom through the find-clinics edge function (supabase/functions/find-clinics),
-- which keeps the TomTom key secret and saves each search for a week.

-- The owner's address, used to find clinics when the phone's location is off. Optional.
alter table public.profiles add column address text not null default ''
  check (char_length(address) <= 200);

-- Saved TomTom searches, one row per ~1 km area ("clinics:v1:<lat>,<lon>") or per typed address
-- ("geo:<sha-256 of the address>", so the address itself isn't kept). Public business listings only.
-- Row Level Security is on with no policies: only the edge function (service role) reads or writes,
-- so no one can add fake clinics through the API.
create table public.clinic_search_cache (
  key text primary key,
  value jsonb not null,
  saved_at timestamptz not null default now()
);
alter table public.clinic_search_cache enable row level security;

-- How many TomTom searches were made (free: 5,000 a month), run in the SQL editor:
--   select count(*) filter (where key like 'clinics:%') as areas_searched,
--          count(*) filter (where key like 'geo:%') as addresses_looked_up
--   from public.clinic_search_cache where saved_at > now() - interval '30 days';
