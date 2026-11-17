-- Enforce the optional lesson/course relationship and remove redundant uniqueness.
-- The primary key on courses(id, user_id) already guarantees this pair is unique.
-- This migration is additive/safe for existing rows: the CHECK is valid for
-- cards without a lesson and requires a course whenever a lesson is assigned.

alter table public.review_cards
  add constraint review_cards_lesson_requires_course
  check (lesson_id is null or course_id is not null);

alter table public.courses
  drop constraint if exists courses_id_user_id_key;
