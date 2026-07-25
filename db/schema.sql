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

-- =====================================================================
-- PM-Modul (Phase 1): Projekte + Aufgaben, gleiches Mehrmandanten-Muster wie oben.
-- =====================================================================

-- ---------- 8) Projekte ----------
create table if not exists public.pm_projects (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  name       text not null,
  color      text,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- 9) Aufgaben ----------
create table if not exists public.pm_tasks (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  project_id  uuid references public.pm_projects(id) on delete cascade,
  title       text not null,
  description text not null default '',
  status      text not null default 'todo' check (status in ('todo','doing','done')),
  assignee    uuid references auth.users(id) on delete set null,
  due_date    date,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists pm_tasks_tenant_idx  on public.pm_tasks(tenant_id);
create index if not exists pm_tasks_project_idx on public.pm_tasks(project_id);

-- ---------- 10) Row Level Security (gleiches Muster: nur eigene Firma) ----------
alter table public.pm_projects enable row level security;
alter table public.pm_tasks    enable row level security;

drop policy if exists pm_projects_all_same_tenant on public.pm_projects;
create policy pm_projects_all_same_tenant on public.pm_projects
  for all using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists pm_tasks_all_same_tenant on public.pm_tasks;
create policy pm_tasks_all_same_tenant on public.pm_tasks
  for all using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

grant select, insert, update, delete on public.pm_projects to authenticated;
grant select, insert, update, delete on public.pm_tasks    to authenticated;

-- =====================================================================
-- PM-Modul Increment 2: Kommentare, Checklisten, DMS-Verknüpfung
-- =====================================================================

create table if not exists public.pm_comments (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  task_id    uuid not null references public.pm_tasks(id) on delete cascade,
  author     uuid references auth.users(id) on delete set null,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists pm_comments_task_idx on public.pm_comments(task_id);

create table if not exists public.pm_checklist_items (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  task_id    uuid not null references public.pm_tasks(id) on delete cascade,
  text       text not null,
  done       boolean not null default false,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists pm_checklist_task_idx on public.pm_checklist_items(task_id);

create table if not exists public.pm_task_documents (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  task_id     uuid not null references public.pm_tasks(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists pm_task_docs_task_idx on public.pm_task_documents(task_id);
create unique index if not exists pm_task_docs_unique on public.pm_task_documents(task_id, document_id);

alter table public.pm_comments        enable row level security;
alter table public.pm_checklist_items enable row level security;
alter table public.pm_task_documents  enable row level security;

drop policy if exists pm_comments_all_same_tenant on public.pm_comments;
create policy pm_comments_all_same_tenant on public.pm_comments
  for all using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists pm_checklist_all_same_tenant on public.pm_checklist_items;
create policy pm_checklist_all_same_tenant on public.pm_checklist_items
  for all using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists pm_task_docs_all_same_tenant on public.pm_task_documents;
create policy pm_task_docs_all_same_tenant on public.pm_task_documents
  for all using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

grant select, insert, update, delete on public.pm_comments        to authenticated;
grant select, insert, update, delete on public.pm_checklist_items to authenticated;
grant select, insert, update, delete on public.pm_task_documents  to authenticated;

-- =====================================================================
-- CRM-Modul (Phase 1): Firmen, Kontakte, Deals, Aktivitäten — eigene "CRM-Projekte"
-- innerhalb einer Firma (z. B. "SAP" / "IT Service Sales"), analog zum Stand-alone-CRM.
-- =====================================================================

create table if not exists public.crm_projects (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_companies (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.crm_projects(id) on delete cascade,
  name       text not null,
  industry   text not null default '',
  website    text not null default '',
  phone      text not null default '',
  address    text not null default '',
  notes      text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists crm_companies_project_idx on public.crm_companies(project_id);

create table if not exists public.crm_contacts (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  project_id   uuid not null references public.crm_projects(id) on delete cascade,
  company_id   uuid references public.crm_companies(id) on delete set null,
  first_name   text not null default '',
  last_name    text not null default '',
  title        text not null default '',
  position     text not null default '',
  last_contact date,
  email        text not null default '',
  phone        text not null default '',
  tags         text[] not null default '{}',
  notes        text not null default '',
  created_at   timestamptz not null default now()
);
create index if not exists crm_contacts_project_idx on public.crm_contacts(project_id);

create table if not exists public.crm_deals (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  project_id  uuid not null references public.crm_projects(id) on delete cascade,
  company_id  uuid references public.crm_companies(id) on delete set null,
  contact_id  uuid references public.crm_contacts(id) on delete set null,
  title       text not null,
  value       numeric not null default 0,
  stage       text not null default 'lead',
  candidate   text not null default '',
  close_date  date,
  notes       text not null default '',
  done        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists crm_deals_project_idx on public.crm_deals(project_id);

create table if not exists public.crm_activities (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.crm_projects(id) on delete cascade,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  deal_id    uuid references public.crm_deals(id) on delete set null,
  title      text not null,
  type       text not null default 'task',
  due_date   date,
  done       boolean not null default false,
  notes      text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists crm_activities_project_idx on public.crm_activities(project_id);

alter table public.crm_projects   enable row level security;
alter table public.crm_companies  enable row level security;
alter table public.crm_contacts   enable row level security;
alter table public.crm_deals      enable row level security;
alter table public.crm_activities enable row level security;

drop policy if exists crm_projects_all_same_tenant on public.crm_projects;
create policy crm_projects_all_same_tenant on public.crm_projects
  for all using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists crm_companies_all_same_tenant on public.crm_companies;
create policy crm_companies_all_same_tenant on public.crm_companies
  for all using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists crm_contacts_all_same_tenant on public.crm_contacts;
create policy crm_contacts_all_same_tenant on public.crm_contacts
  for all using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists crm_deals_all_same_tenant on public.crm_deals;
create policy crm_deals_all_same_tenant on public.crm_deals
  for all using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

drop policy if exists crm_activities_all_same_tenant on public.crm_activities;
create policy crm_activities_all_same_tenant on public.crm_activities
  for all using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

grant select, insert, update, delete on public.crm_projects   to authenticated;
grant select, insert, update, delete on public.crm_companies  to authenticated;
grant select, insert, update, delete on public.crm_contacts   to authenticated;
grant select, insert, update, delete on public.crm_deals      to authenticated;
grant select, insert, update, delete on public.crm_activities to authenticated;

alter table public.crm_projects add column if not exists stages jsonb;

-- =====================================================================
-- Einladungs-Modell: kein offener Self-Signup in eine fremde Firma.
-- Ein Admin trägt die E-Mail eines Kollegen ein -> registriert sich diese
-- Person, landet sie automatisch in der Firma des Admins (statt einer neuen).
-- =====================================================================

create table if not exists public.invites (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  email       text not null,
  invited_by  uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);
-- Nur eine offene Einladung pro E-Mail gleichzeitig (verhindert Dubletten).
create unique index if not exists invites_email_pending_idx on public.invites (lower(email)) where accepted_at is null;

alter table public.invites enable row level security;

drop policy if exists invites_select_same_tenant on public.invites;
create policy invites_select_same_tenant on public.invites
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists invites_insert_admin on public.invites;
create policy invites_insert_admin on public.invites
  for insert with check (
    tenant_id = public.current_tenant_id()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

drop policy if exists invites_delete_admin on public.invites;
create policy invites_delete_admin on public.invites
  for delete using (
    tenant_id = public.current_tenant_id()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

grant select, insert, delete on public.invites to authenticated;

-- provision_profile ERWEITERT: prüft zuerst auf eine offene Einladung für die
-- E-Mail-Adresse. Falls vorhanden -> Nutzer wird 'member' in der EINLADENDEN
-- Firma (keine neue Firma). Sonst wie bisher: eigene neue Firma als 'admin'.
create or replace function public.provision_profile(p_id uuid, p_email text, p_company text default null)
returns void language plpgsql security definer set search_path = public as $$
declare new_tenant uuid; inv record;
begin
  if exists (select 1 from public.profiles where id = p_id) then
    return;
  end if;

  select * into inv from public.invites
    where lower(email) = lower(p_email) and accepted_at is null
    limit 1;

  if inv.id is not null then
    insert into public.profiles (id, tenant_id, role, display_name)
      values (p_id, inv.tenant_id, 'member', p_email);
    update public.invites set accepted_at = now() where id = inv.id;
    return;
  end if;

  insert into public.tenants (name)
    values (coalesce(p_company,'Mein Unternehmen'))
    returning id into new_tenant;
  insert into public.profiles (id, tenant_id, role, display_name)
    values (p_id, new_tenant, 'admin', p_email);
end $$;

-- Wichtig: PostgREST-Schema-Cache aktualisieren, sonst "table not found" trotz erfolgreichem CREATE TABLE.
notify pgrst, 'reload schema';
