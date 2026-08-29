-- ============================================================
--  Ενιαίος Οδηγός ΕΣΗΔΗΣ — Δήμος Ρόδου
--  Πλήρες σχήμα του ΔΙΚΟΥ ΤΟΥ Supabase project.
--
--  Εκτελέστε το ΟΛΟΚΛΗΡΟ μία φορά, σε ΚΑΙΝΟΥΡΓΙΟ και ΚΕΝΟ project:
--  Supabase → SQL Editor → New query → επικόλληση → Run.
--
--  Δεν εξαρτάται από κανέναν πίνακα των Προμηθειών ή του ΥΔΕ.
--  Οι χρήστες του project αυτού είναι αποκλειστικά του Οδηγού.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Προφίλ χρηστών του Οδηγού
-- ------------------------------------------------------------
create table if not exists public.esidis_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  role        text not null default 'viewer'
              check (role in ('admin','member','viewer')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.esidis_profiles is
  'Χρήστες του Οδηγού ΕΣΗΔΗΣ. Ανεξάρτητοι από Προμήθειες και ΥΔΕ.';

-- Κάθε νέος λογαριασμός στο Authentication παίρνει αυτόματα προφίλ «Προβολή μόνο».
create or replace function public.esidis_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.esidis_profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists esidis_on_auth_user_created on auth.users;
create trigger esidis_on_auth_user_created
  after insert on auth.users
  for each row execute function public.esidis_handle_new_user();

-- ------------------------------------------------------------
-- 2. Βοηθητικές συναρτήσεις ελέγχου (security definer:
--    διαβάζουν τα προφίλ χωρίς να ενεργοποιούν ξανά το RLS)
-- ------------------------------------------------------------
create or replace function public.esidis_is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.esidis_profiles p
    where p.id = auth.uid() and p.is_active
  );
$$;

create or replace function public.esidis_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.esidis_profiles p
    where p.id = auth.uid() and p.is_active and p.role = 'admin'
  );
$$;

-- ------------------------------------------------------------
-- 3. Κοινοί φάκελοι υπηρεσίας
-- ------------------------------------------------------------
create table if not exists public.esidis_folders (
  id                uuid primary key default gen_random_uuid(),
  sector            text not null check (sector in ('erga','promitheies')),
  title             text not null,
  state             jsonb not null default '{}'::jsonb,
  status            text not null default 'active'
                    check (status in ('active','archived')),
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users(id) on delete set null,
  updated_by_email  text
);

create index if not exists esidis_folders_sector_idx
  on public.esidis_folders (sector, status, updated_at desc);

-- Ποιος και πότε ενημέρωσε — η εφαρμογή στηρίζεται σε αυτό
-- για τον έλεγχο ταυτόχρονης επεξεργασίας.
create or replace function public.esidis_touch_folder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.updated_by_email := (select email from auth.users where id = auth.uid());
  return new;
end;
$$;

drop trigger if exists esidis_folders_touch on public.esidis_folders;
create trigger esidis_folders_touch
  before insert or update on public.esidis_folders
  for each row execute function public.esidis_touch_folder();

-- ------------------------------------------------------------
-- 4. Ιστορικό ενεργειών
-- ------------------------------------------------------------
create table if not exists public.esidis_folder_log (
  id         bigserial primary key,
  folder_id  uuid references public.esidis_folders(id) on delete cascade,
  action     text,
  note       text,
  by_user    uuid references auth.users(id) on delete set null,
  at         timestamptz not null default now()
);

create index if not exists esidis_folder_log_folder_idx
  on public.esidis_folder_log (folder_id, at desc);

-- ------------------------------------------------------------
-- 5. RLS — καμία πρόσβαση χωρίς ενεργό προφίλ
-- ------------------------------------------------------------
alter table public.esidis_profiles   enable row level security;
alter table public.esidis_folders    enable row level security;
alter table public.esidis_folder_log enable row level security;

-- Προφίλ: το βλέπει κάθε ενεργό μέλος· το αλλάζει μόνο διαχειριστής.
drop policy if exists esidis_profiles_select on public.esidis_profiles;
create policy esidis_profiles_select on public.esidis_profiles
  for select to authenticated
  using (id = auth.uid() or public.esidis_is_member());

drop policy if exists esidis_profiles_update on public.esidis_profiles;
create policy esidis_profiles_update on public.esidis_profiles
  for update to authenticated
  using (public.esidis_is_admin())
  with check (public.esidis_is_admin());

-- Φάκελοι: πλήρης χρήση από κάθε ενεργό μέλος.
drop policy if exists esidis_folders_select on public.esidis_folders;
create policy esidis_folders_select on public.esidis_folders
  for select to authenticated using (public.esidis_is_member());

drop policy if exists esidis_folders_insert on public.esidis_folders;
create policy esidis_folders_insert on public.esidis_folders
  for insert to authenticated with check (public.esidis_is_member());

drop policy if exists esidis_folders_update on public.esidis_folders;
create policy esidis_folders_update on public.esidis_folders
  for update to authenticated
  using (public.esidis_is_member())
  with check (public.esidis_is_member());

-- Διαγραφή: μόνο διαχειριστής και μόνο αρχειοθετημένος φάκελος.
drop policy if exists esidis_folders_delete on public.esidis_folders;
create policy esidis_folders_delete on public.esidis_folders
  for delete to authenticated
  using (public.esidis_is_admin() and status = 'archived');

-- Ιστορικό: το γράφει και το διαβάζει κάθε ενεργό μέλος.
drop policy if exists esidis_folder_log_select on public.esidis_folder_log;
create policy esidis_folder_log_select on public.esidis_folder_log
  for select to authenticated using (public.esidis_is_member());

drop policy if exists esidis_folder_log_insert on public.esidis_folder_log;
create policy esidis_folder_log_insert on public.esidis_folder_log
  for insert to authenticated
  with check (public.esidis_is_member() and by_user = auth.uid());

-- ------------------------------------------------------------
-- 6. Δικαιώματα εκτέλεσης
--    Οι συναρτήσεις των triggers δεν έχουν λόγο να είναι καλέσιμες
--    από το REST API· οι βοηθητικές του RLS μόνο από συνδεδεμένους.
-- ------------------------------------------------------------
revoke all on function public.esidis_handle_new_user() from public, anon, authenticated;
revoke all on function public.esidis_touch_folder()    from public, anon, authenticated;

revoke all on function public.esidis_is_member() from public, anon;
revoke all on function public.esidis_is_admin() from public, anon;
grant execute on function public.esidis_is_member() to authenticated;
grant execute on function public.esidis_is_admin() to authenticated;

-- ------------------------------------------------------------
-- 7. Πρώτος διαχειριστής
--    Αφού δημιουργήσετε τον λογαριασμό σας από
--    Authentication → Users → Add user, τρέξτε:
-- ------------------------------------------------------------
-- update public.esidis_profiles
--    set role = 'admin', is_active = true
--  where email = 'diakolios@rhodes.gr';
