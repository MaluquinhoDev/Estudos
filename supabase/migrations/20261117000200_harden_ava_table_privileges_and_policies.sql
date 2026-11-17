-- AVA / PowerSync least-privilege cleanup.
-- Keep RLS as the row-level boundary; grants are the object-level boundary.
-- This migration is additive to the existing authenticated CRUD grants.

-- Anonymous browser sessions must not access AVA application tables.
REVOKE ALL PRIVILEGES ON TABLE
  public.profiles,
  public.courses,
  public.modules,
  public.lessons,
  public.review_cards,
  public.resources
FROM anon;

-- Profiles are readable/updatable by their owner; no profile CRUD beyond that.
REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM authenticated;
GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;

-- Content tables need normal CRUD for the signed-in owner, enforced by RLS.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.courses,
  public.modules,
  public.lessons,
  public.review_cards,
  public.resources
FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.courses,
  public.modules,
  public.lessons,
  public.review_cards,
  public.resources
TO authenticated;

-- Remove duplicate permissive policies while preserving one equivalent policy
-- per command/table. These names were confirmed by the project's audit output.
DROP POLICY IF EXISTS courses_owner_all ON public.courses;
DROP POLICY IF EXISTS lessons_owner_all ON public.lessons;
DROP POLICY IF EXISTS modules_owner_all ON public.modules;
DROP POLICY IF EXISTS resources_owner_all ON public.resources;
DROP POLICY IF EXISTS review_cards_owner_all ON public.review_cards;
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;

NOTIFY pgrst, 'reload schema';
