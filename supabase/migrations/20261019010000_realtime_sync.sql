-- Live sync between devices: send row changes on these tables to signed-in clients through
-- Supabase Realtime, so an edit on one phone shows up on another without a refresh.
-- Row Level Security still decides what each user receives for inserts and updates.
-- (For deletes Postgres can't check the old row, so Realtime sends only its id.)

alter publication supabase_realtime add table
  public.profiles,
  public.pets,
  public.medical_records,
  public.vaccinations,
  public.documents,
  public.feeding_schedules,
  public.feeding_log,
  public.care_tasks;
