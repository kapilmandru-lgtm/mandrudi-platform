-- =====================================================================
-- Mandrudi Plattform — Phase 1 Datenbank-Schema
-- Mehrmandantenfähig (jede Firma sieht nur ihre Daten) + DMS-Grundlage.
-- Einmal im Supabase SQL-Editor ausführen (Run). Ist wiederholbar (idempotent).
-- =====================================================================

-- ---------- 1) Firmen (Mandanten) ----------
create table if not exists public.tenants (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'Mein Unternehmen',
  created_at timestamptz not null default now()
);

-- ---------- 2) Profile (1:1 zu Login-Nutzer) -> Firma + Rolle ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  role         text not null default 'member' check (role in ('admin','member')),
  display_name text,
  lang         text default 'de',
  created_at   timestamptz not null default now()
);

-- Hilfsfunktion: Firma des aktuell eingeloggten Nutzers (umgeht RLS -> keine Rekursion)
create or replace function public.current_tenant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select tenant_id from public.profiles where id = auth.uid()
$$;

-- ---------- 3) Bei Neuanmeldung automatisch Firma + Profil anlegen ----------
-- Gemeinsame, idempotente Provisionierung: legt Firma+Profil nur an, wenn
-- noch keins existiert. Wird vom Trigger (Normalfall) UND von der
-- ensure_my_profile()-RPC (Selbstheilung, falls der Trigger mal nicht griff
-- oder ein Nutzer aus der Zeit vor diesem Schema stammt) genutzt.
create or replace function public.provision_profile(p_id uuid, p_email text, p_company text default null)
returns void language plpgsql security definer set search_path = public as $$
declare new_tenant uuid;
begin
  if exists (select 1 from public.profiles where id = p_id) then
    return;
  end if;
  insert into public.tenants (name)
    values (coalesce(p_company,'Mein Unternehmen'))
    returning id into new_tenant;
  insert into public.profiles (id, tenant_id, role, display_name)
    values (p_id, new_tenant, 'admin', p_email);
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.provision_profile(new.id, new.email, new.raw_user_meta_data->>'company');
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- Selbstheilung vom Client aus aufrufbar: legt das eigene Profil nach, falls
-- es fehlt (z. B. Trigger kurzzeitig deaktiviert, oder Alt-Nutzer ohne Profil).
-- security definer, aber nur für den eigenen auth.uid() -> kein Missbrauch möglich.
create or replace function public.ensure_my_profile()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.provision_profile(auth.uid(), (select email from auth.users where id = auth.uid()));
end $$;
grant execute on function public.ensure_my_profile() to authenticated;

-- ---------- 4) Ordner ----------
create table if not exists public.folders (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  name       text not null,
  parent_id  uuid references public.folders(id) on delete cascade,
  is_hidden  boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- 5) Dokumente ----------
create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  owner        uuid not null references auth.users(id),
  name         text not null,
  folder_id    uuid references public.folders(id) on delete set null,
  category     text,
  tags         text[] not null default '{}',
  size_bytes   bigint,
  storage_path text not null,               -- Pfad im Storage: <tenant_id>/<datei>
  is_hidden    boolean not null default false,
  is_encrypted boolean not null default false,
  deleted_at   timestamptz,                 -- Soft-Delete = Papierkorb
  created_at   timestamptz not null default now()
);

create index if not exists documents_tenant_idx on public.documents(tenant_id);
create index if not exists documents_folder_idx on public.documents(folder_id);
alter table public.documents add column if not exists amount numeric;   -- Betrag je Beleg (für Analyse/Excel)

-- ---------- 6) Row Level Security aktivieren ----------
alter table public.tenants   enable row level security;
alter table public.profiles  enable row level security;
alter table public.folders   enable row level security;
alter table public.documents enable row level security;

-- Policies (drop-if-exists macht das Skript wiederholbar)
drop policy if exists tenants_select_own on public.tenants;
create policy tenants_select_own on public.tenants
  for select using (id = public.current_tenant_id());

drop policy if exists profiles_select_same_tenant on public.profiles;
create policy profiles_select_same_tenant on public.profiles
  for select using (tenant_id = public.current_tenant_id());
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid());

drop policy if exists folders_all_same_tenant on public.folders;
create policy folders_all_same_tenant on public.folders
  for all using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists documents_all_same_tenant on public.documents;
create policy documents_all_same_tenant on public.documents
  for all using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- ---------- 6b) Zugriffsrechte (nötig, weil "auto-expose new tables" bewusst AUS ist) ----------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.documents to authenticated;
grant select, insert, update, delete on public.folders    to authenticated;
grant select on public.tenants to authenticated;
grant select, update on public.profiles to authenticated;

-- ---------- 7) Privater Datei-Speicher (Storage-Bucket) ----------
insert into storage.buckets (id, name, public)
  values ('documents','documents', false)
  on conflict (id) do nothing;

-- Storage-RLS: Nutzer dürfen nur Dateien im Ordner ihrer Firma (<tenant_id>/...) sehen/anlegen/löschen
drop policy if exists docs_storage_select on storage.objects;
create policy docs_storage_select on storage.objects for select using (
  bucket_id = 'documents' and (storage.foldername(name))[1] = public.current_tenant_id()::text
);
drop policy if exists docs_storage_insert on storage.objects;
create policy docs_storage_insert on storage.objects for insert with check (
  bucket_id = 'documents' and (storage.foldername(name))[1] = public.current_tenant_id()::text
);
drop policy if exists docs_storage_delete on storage.objects;
create policy docs_storage_delete on storage.objects for delete using (
  bucket_id = 'documents' and (storage.foldername(name))[1] = public.current_tenant_id()::text
);
-- Update noetig, um eine Datei am selben Pfad zu ersetzen (z. B. Ver-/Entschluesseln in-place)
drop policy if exists docs_storage_update on storage.objects;
create policy docs_storage_update on storage.objects for update using (
  bucket_id = 'documents' and (storage.foldername(name))[1] = public.current_tenant_id()::text
) with check (
  bucket_id = 'documents' and (storage.foldername(name))[1] = public.current_tenant_id()::text
);

-- Fertig. Jeder neue Login bekommt automatisch eine eigene Firma (als Admin);
-- weitere Mitarbeiter kommen später per Einladung in dieselbe Firma.
