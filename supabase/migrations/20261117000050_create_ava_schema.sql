-- Bootstrap schema for Estudos AVA.
-- This migration is intentionally ordered before the authenticated grants migration.
-- IDs are text because the current PWA creates client-side string identifiers.
-- User ownership is enforced by RLS and composite foreign keys.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.courses (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  category text not null default '',
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courses_id_user_id_unique unique (id, user_id)
);

create table if not exists public.modules (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null,
  title text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint modules_id_user_id_unique unique (id, user_id),
  constraint modules_course_owner_fk
    foreign key (course_id, user_id)
    references public.courses (id, user_id) on delete cascade
);

create table if not exists public.lessons (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null,
  module_id text not null,
  title text not null default '',
  description text not null default '',
  notes text not null default '',
  status text not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lessons_id_user_id_unique unique (id, user_id),
  constraint lessons_course_owner_fk
    foreign key (course_id, user_id)
    references public.courses (id, user_id) on delete cascade,
  constraint lessons_module_owner_fk
    foreign key (module_id, user_id)
    references public.modules (id, user_id) on delete cascade
);

create table if not exists public.review_cards (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id text,
  lesson_id text,
  course_title text not null default '',
  front text not null default '',
  back text not null default '',
  due text,
  interval integer not null default 0,
  repetitions integer not null default 0,
  last_reviewed text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint review_cards_id_user_id_unique unique (id, user_id)
);

create table if not exists public.resources (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id text,
  title text not null default '',
  type text not null default 'Outro',
  url text not null default '',
  description text not null default '',
  course_title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resources_id_user_id_unique unique (id, user_id)
);

create index if not exists courses_user_id_idx on public.courses (user_id);
create index if not exists modules_user_course_idx on public.modules (user_id, course_id, position);
create index if not exists lessons_user_course_idx on public.lessons (user_id, course_id);
create index if not exists lessons_user_module_idx on public.lessons (user_id, module_id);
create index if not exists review_cards_user_due_idx on public.review_cards (user_id, due);
create index if not exists resources_user_course_idx on public.resources (user_id, course_id);

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.modules enable row level security;
alter table public.lessons enable row level security;
alter table public.review_cards enable row level security;
alter table public.resources enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "Users manage own courses" on public.courses;
create policy "Users manage own courses"
  on public.courses for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users manage own modules" on public.modules;
create policy "Users manage own modules"
  on public.modules for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users manage own lessons" on public.lessons;
create policy "Users manage own lessons"
  on public.lessons for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users manage own review cards" on public.review_cards;
create policy "Users manage own review cards"
  on public.review_cards for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users manage own resources" on public.resources;
create policy "Users manage own resources"
  on public.resources for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
