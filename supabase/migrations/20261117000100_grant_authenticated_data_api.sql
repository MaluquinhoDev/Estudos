-- PowerSync upload path uses the authenticated Supabase client.
-- RLS remains enabled and is the authorization boundary for every row.
-- This migration grants table privileges only; it does not bypass RLS.

grant select, update on table public.profiles to authenticated;

grant select, insert, update, delete on table
  public.courses,
  public.modules,
  public.lessons,
  public.review_cards,
  public.resources
to authenticated;

comment on table public.courses is
  'User-owned AVA course data. Access is restricted by RLS policies.';
comment on table public.modules is
  'User-owned AVA module data. Access is restricted by RLS policies.';
comment on table public.lessons is
  'User-owned AVA lesson data. Access is restricted by RLS policies.';
comment on table public.review_cards is
  'User-owned spaced-repetition data. Access is restricted by RLS policies.';
comment on table public.resources is
  'User-owned learning resources. Access is restricted by RLS policies.';
