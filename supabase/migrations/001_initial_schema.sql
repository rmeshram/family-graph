-- ─────────────────────────────────────────────────────────────────────────────
-- Family Graph — Full Schema Migration
-- Run this in Supabase SQL Editor → New Query → Run
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ─── families ────────────────────────────────────────────────────────────────
create table if not exists public.families (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  invite_code   text not null unique,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ─── profiles (one per auth user) ─────────────────────────────────────────
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  family_id     uuid references public.families(id) on delete set null,
  member_id     uuid,  -- FK added after family_members is created
  display_name  text,
  avatar_url    text,
  phone         text,
  role          text not null default 'viewer' check (role in ('admin','contributor','viewer')),
  created_at    timestamptz not null default now()
);

-- ─── family_members ───────────────────────────────────────────────────────
create table if not exists public.family_members (
  id               uuid primary key default gen_random_uuid(),
  family_id        uuid not null references public.families(id) on delete cascade,
  name             text not null,
  birth_year       integer,
  death_year       integer,
  birth_place      text,
  current_place    text,
  photo_url        text,
  bio              text,
  relationship     text,
  occupation       text,
  parent_ids       uuid[] not null default '{}',
  spouse_ids       uuid[] not null default '{}',
  generation       integer not null default 0,
  is_alive         boolean not null default true,
  gender           text check (gender in ('male','female','other')),
  tags             text[] not null default '{}',
  side             text check (side in ('paternal','maternal','both','spouse')),
  role             text check (role in ('admin','contributor','viewer')),
  gotra            text,
  caste            text,
  hometown         text,
  native_language  text,
  religion         text,
  phone            text,
  email            text,
  added_by         uuid references auth.users(id) on delete set null,
  added_at         timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Add FK from profiles.member_id → family_members.id (idempotent)
alter table public.profiles
  drop constraint if exists profiles_member_id_fkey;
alter table public.profiles
  add constraint profiles_member_id_fkey
  foreign key (member_id) references public.family_members(id) on delete set null;

-- ─── stories ─────────────────────────────────────────────────────────────
create table if not exists public.stories (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families(id) on delete cascade,
  member_id    uuid not null references public.family_members(id) on delete cascade,
  title        text not null,
  content      text not null,
  date         date,
  author       text,
  ai_generated boolean not null default false,
  language     text default 'en',
  created_at   timestamptz not null default now()
);

-- ─── memories (photos) ────────────────────────────────────────────────────
create table if not exists public.memories (
  id                  uuid primary key default gen_random_uuid(),
  family_id           uuid not null references public.families(id) on delete cascade,
  title               text not null,
  description         text,
  photo_url           text,
  event_type          text not null default 'other'
                        check (event_type in ('wedding','birth','festival','graduation','travel','family-gathering','other')),
  year                integer,
  date                date,
  tagged_member_ids   uuid[] not null default '{}',
  uploaded_by         uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now()
);

-- ─── voice_notes ──────────────────────────────────────────────────────────
create table if not exists public.voice_notes (
  id                uuid primary key default gen_random_uuid(),
  family_id         uuid not null references public.families(id) on delete cascade,
  member_id         uuid not null references public.family_members(id) on delete cascade,
  title             text not null,
  duration_seconds  integer not null default 0,
  file_url          text,
  transcription     text,
  translation       text,
  language          text default 'hi',
  recorded_by       uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now()
);

-- ─── events ───────────────────────────────────────────────────────────────
create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families(id) on delete cascade,
  title        text not null,
  description  text,
  event_date   timestamptz not null,
  location     text,
  created_by   uuid references auth.users(id) on delete set null,
  rsvps        jsonb not null default '{}',
  created_at   timestamptz not null default now()
);

-- ─── invite_links ─────────────────────────────────────────────────────────
create table if not exists public.invite_links (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families(id) on delete cascade,
  code        text not null unique,
  role        text not null default 'contributor' check (role in ('admin','contributor','viewer')),
  created_by  uuid references auth.users(id) on delete set null,
  expires_at  timestamptz,
  used_count  integer not null default 0,
  max_uses    integer,
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists idx_family_members_family_id on public.family_members(family_id);
create index if not exists idx_stories_member_id        on public.stories(member_id);
create index if not exists idx_memories_family_id       on public.memories(family_id);
create index if not exists idx_voice_notes_member_id    on public.voice_notes(member_id);
create index if not exists idx_events_family_id         on public.events(family_id);
create index if not exists idx_invite_links_code        on public.invite_links(code);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security (RLS)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.families       enable row level security;
alter table public.profiles       enable row level security;
alter table public.family_members enable row level security;
alter table public.stories        enable row level security;
alter table public.memories       enable row level security;
alter table public.voice_notes    enable row level security;
alter table public.events         enable row level security;
alter table public.invite_links   enable row level security;

-- Helper: get the family_id of the current user
create or replace function public.my_family_id()
returns uuid language sql stable security definer as $$
  select family_id from public.profiles where id = auth.uid() limit 1;
$$;

-- families — only family members can see/edit their family
drop policy if exists "families: members can read"   on public.families;
drop policy if exists "families: creator can update" on public.families;
drop policy if exists "families: creator can insert" on public.families;
create policy "families: members can read"   on public.families for select using (id = public.my_family_id());
create policy "families: creator can update" on public.families for update using (created_by = auth.uid());
create policy "families: creator can insert" on public.families for insert with check (created_by = auth.uid());

-- profiles — own row only
drop policy if exists "profiles: own row"     on public.profiles;
drop policy if exists "profiles: family read" on public.profiles;
create policy "profiles: own row"     on public.profiles for all    using (id = auth.uid());
create policy "profiles: family read" on public.profiles for select using (family_id = public.my_family_id());

-- family_members — all in same family
drop policy if exists "members: family can read"    on public.family_members;
drop policy if exists "members: contrib can insert" on public.family_members;
drop policy if exists "members: contrib can update" on public.family_members;
drop policy if exists "members: admin can delete"   on public.family_members;
create policy "members: family can read"    on public.family_members for select using (family_id = public.my_family_id());
create policy "members: contrib can insert" on public.family_members for insert with check (family_id = public.my_family_id());
create policy "members: contrib can update" on public.family_members for update using (family_id = public.my_family_id());
create policy "members: admin can delete"   on public.family_members for delete using (
  family_id = public.my_family_id() and
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- stories
drop policy if exists "stories: family"  on public.stories;
create policy "stories: family"  on public.stories    for all using (family_id = public.my_family_id());
-- memories
drop policy if exists "memories: family" on public.memories;
create policy "memories: family" on public.memories   for all using (family_id = public.my_family_id());
-- voice_notes
drop policy if exists "vnotes: family"   on public.voice_notes;
create policy "vnotes: family"   on public.voice_notes for all using (family_id = public.my_family_id());
-- events
drop policy if exists "events: family"   on public.events;
create policy "events: family"   on public.events     for all using (family_id = public.my_family_id());
-- invite_links
drop policy if exists "invites: family"  on public.invite_links;
create policy "invites: family"  on public.invite_links for all using (family_id = public.my_family_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger: auto-create profile on new user signup
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, display_name, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.phone,
    'viewer'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- Storage buckets (run manually in Supabase dashboard if SQL doesn't work)
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('family-photos', 'family-photos', true, 10485760, array['image/jpeg','image/png','image/webp','image/gif']),
  ('voice-notes',   'voice-notes',   false, 26214400, array['audio/webm','audio/mp4','audio/mpeg','audio/ogg','audio/wav'])
on conflict (id) do nothing;

-- Storage policies: family members can upload/read
drop policy if exists "photos: family read"   on storage.objects;
drop policy if exists "photos: family insert" on storage.objects;
drop policy if exists "vnote: family read"    on storage.objects;
drop policy if exists "vnote: family insert"  on storage.objects;
create policy "photos: family read"   on storage.objects for select using (bucket_id = 'family-photos');
create policy "photos: family insert" on storage.objects for insert with check (bucket_id = 'family-photos' and auth.role() = 'authenticated');
create policy "vnote: family read"    on storage.objects for select using (bucket_id = 'voice-notes' and auth.role() = 'authenticated');
create policy "vnote: family insert"  on storage.objects for insert with check (bucket_id = 'voice-notes' and auth.role() = 'authenticated');
