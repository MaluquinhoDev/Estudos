-- AVA / PowerSync schema audit (read-only)
-- Execute no SQL Editor do projeto Supabase.
-- Mostra colunas, chaves, relações com pareamento posicional, RLS,
-- políticas e privilégios efetivos de anon/authenticated.

WITH expected_columns(table_name, column_name, expected_type, expected_nullable) AS (
  VALUES
    ('profiles','id','uuid','NO'),
    ('profiles','display_name','text','YES'),
    ('profiles','created_at','timestamp with time zone','NO'),
    ('profiles','updated_at','timestamp with time zone','NO'),
    ('courses','id','text','NO'), ('courses','user_id','uuid','NO'),
    ('courses','title','text','NO'), ('courses','category','text','NO'),
    ('courses','description','text','NO'), ('courses','created_at','timestamp with time zone','NO'),
    ('courses','updated_at','timestamp with time zone','NO'),
    ('modules','id','text','NO'), ('modules','user_id','uuid','NO'),
    ('modules','course_id','text','NO'), ('modules','title','text','NO'),
    ('modules','position','integer','NO'), ('modules','created_at','timestamp with time zone','NO'),
    ('modules','updated_at','timestamp with time zone','NO'),
    ('lessons','id','text','NO'), ('lessons','user_id','uuid','NO'),
    ('lessons','course_id','text','NO'), ('lessons','module_id','text','NO'),
    ('lessons','title','text','NO'), ('lessons','description','text','NO'),
    ('lessons','notes','text','NO'), ('lessons','status','text','NO'),
    ('lessons','created_at','timestamp with time zone','NO'),
    ('lessons','updated_at','timestamp with time zone','NO'),
    ('review_cards','id','text','NO'), ('review_cards','user_id','uuid','NO'),
    ('review_cards','course_id','text','YES'), ('review_cards','lesson_id','text','YES'),
    ('review_cards','course_title','text','NO'), ('review_cards','front','text','NO'),
    ('review_cards','back','text','NO'), ('review_cards','due','date','YES'),
    ('review_cards','interval','integer','NO'), ('review_cards','repetitions','integer','NO'),
    ('review_cards','last_reviewed','date','YES'),
    ('review_cards','created_at','timestamp with time zone','NO'),
    ('review_cards','updated_at','timestamp with time zone','NO'),
    ('resources','id','text','NO'), ('resources','user_id','uuid','NO'),
    ('resources','course_id','text','YES'), ('resources','title','text','NO'),
    ('resources','type','text','NO'), ('resources','url','text','NO'),
    ('resources','description','text','NO'), ('resources','course_title','text','NO'),
    ('resources','created_at','timestamp with time zone','NO'),
    ('resources','updated_at','timestamp with time zone','NO')
),
column_results AS (
  SELECT 'COLUMN'::text AS section, e.table_name, e.column_name AS object_name,
    COALESCE(c.data_type, 'MISSING') || '; nullable=' || COALESCE(c.is_nullable, 'UNKNOWN') AS actual,
    e.expected_type || '; nullable=' || e.expected_nullable AS expected,
    CASE WHEN c.column_name IS NULL THEN 'FAIL'
         WHEN c.data_type = e.expected_type AND c.is_nullable = e.expected_nullable THEN 'PASS'
         ELSE 'REVIEW' END AS status
  FROM expected_columns e
  LEFT JOIN information_schema.columns c
    ON c.table_schema='public' AND c.table_name=e.table_name AND c.column_name=e.column_name
),
primary_keys AS (
  SELECT 'PRIMARY_KEY'::text AS section, t.table_name, 'primary key'::text AS object_name,
    COALESCE(string_agg(a.attname, ', ' ORDER BY k.ordinality), 'MISSING') AS actual,
    CASE WHEN t.table_name='profiles' THEN 'id' ELSE 'id, user_id' END AS expected,
    CASE WHEN COALESCE(array_agg(a.attname ORDER BY k.ordinality)
              FILTER (WHERE a.attname IS NOT NULL), ARRAY[]::name[])
              = CASE WHEN t.table_name='profiles' THEN ARRAY['id']::name[]
                     ELSE ARRAY['id','user_id']::name[] END
         THEN 'PASS' ELSE 'FAIL' END AS status
  FROM (VALUES ('profiles'),('courses'),('modules'),('lessons'),('review_cards'),('resources')) t(table_name)
  LEFT JOIN pg_class rel ON rel.oid=to_regclass('public.' || t.table_name)
  LEFT JOIN pg_constraint con ON con.conrelid=rel.oid AND con.contype='p'
  LEFT JOIN LATERAL unnest(con.conkey) WITH ORDINALITY k(attnum, ordinality) ON true
  LEFT JOIN pg_attribute a ON a.attrelid=rel.oid AND a.attnum=k.attnum
  GROUP BY t.table_name
),
rls AS (
  SELECT 'RLS'::text AS section, t.table_name, 'row level security'::text AS object_name,
    COALESCE(c.relrowsecurity::text, 'TABLE MISSING') AS actual, 'true'::text AS expected,
    CASE WHEN c.relrowsecurity THEN 'PASS' ELSE 'FAIL' END AS status
  FROM (VALUES ('profiles'),('courses'),('modules'),('lessons'),('review_cards'),('resources')) t(table_name)
  LEFT JOIN pg_class c ON c.oid=to_regclass('public.' || t.table_name)
),
foreign_keys AS (
  SELECT 'FOREIGN_KEY'::text AS section, src.relname AS table_name,
    c.conname || ' [' || src_col.attname || ' → ' || ref.relname || '.' || ref_col.attname || ']' AS object_name,
    pg_get_constraintdef(c.oid) AS actual,
    'Verify referenced parent and tenant columns'::text AS expected,
    'REVIEW'::text AS status
  FROM pg_constraint c
  JOIN pg_class src ON src.oid=c.conrelid
  JOIN pg_class ref ON ref.oid=c.confrelid
  JOIN LATERAL unnest(c.conkey) WITH ORDINALITY src_key(attnum, ordinality) ON true
  JOIN LATERAL unnest(c.confkey) WITH ORDINALITY ref_key(attnum, ordinality)
    ON ref_key.ordinality=src_key.ordinality
  JOIN pg_attribute src_col ON src_col.attrelid=src.oid AND src_col.attnum=src_key.attnum
  JOIN pg_attribute ref_col ON ref_col.attrelid=ref.oid AND ref_col.attnum=ref_key.attnum
  WHERE c.contype='f' AND src.relnamespace='public'::regnamespace
    AND src.relname IN ('profiles','courses','modules','lessons','review_cards','resources')
),
policies AS (
  SELECT 'POLICY'::text AS section, p.tablename AS table_name, p.policyname AS object_name,
    'roles=' || p.roles::text || '; command=' || p.cmd ||
      '; USING=' || COALESCE(p.qual,'NULL') || '; WITH CHECK=' || COALESCE(p.with_check,'NULL') AS actual,
    'Manually verify owner restriction using auth.uid()'::text AS expected, 'REVIEW'::text AS status
  FROM pg_policies p
  WHERE p.schemaname='public'
    AND p.tablename IN ('profiles','courses','modules','lessons','review_cards','resources')
),
expected_grants(table_name, grantee, allowed) AS (
  VALUES
    ('profiles','anon', ARRAY[]::text[]),
    ('courses','anon', ARRAY[]::text[]), ('modules','anon', ARRAY[]::text[]),
    ('lessons','anon', ARRAY[]::text[]), ('review_cards','anon', ARRAY[]::text[]),
    ('resources','anon', ARRAY[]::text[]),
    ('profiles','authenticated', ARRAY['SELECT','UPDATE']::text[]),
    ('courses','authenticated', ARRAY['DELETE','INSERT','SELECT','UPDATE']::text[]),
    ('modules','authenticated', ARRAY['DELETE','INSERT','SELECT','UPDATE']::text[]),
    ('lessons','authenticated', ARRAY['DELETE','INSERT','SELECT','UPDATE']::text[]),
    ('review_cards','authenticated', ARRAY['DELETE','INSERT','SELECT','UPDATE']::text[]),
    ('resources','authenticated', ARRAY['DELETE','INSERT','SELECT','UPDATE']::text[])
),
grants_audit AS (
  SELECT 'GRANT'::text AS section, e.table_name, e.grantee AS object_name,
    COALESCE(array_to_string((
      SELECT array_agg(privilege ORDER BY privilege)
      FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']::text[]) privilege
      WHERE (privilege <> 'MAINTAIN' OR current_setting('server_version_num')::integer >= 170000)
        AND has_table_privilege(e.grantee, format('public.%I',e.table_name), privilege)
    ), ', '), 'NONE') AS actual,
    COALESCE(array_to_string(e.allowed, ', '), 'NONE') AS expected,
    CASE WHEN COALESCE((
      SELECT array_agg(privilege ORDER BY privilege)
      FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']::text[]) privilege
      WHERE (privilege <> 'MAINTAIN' OR current_setting('server_version_num')::integer >= 170000)
        AND has_table_privilege(e.grantee, format('public.%I',e.table_name), privilege)
    ), ARRAY[]::text[]) = e.allowed THEN 'PASS' ELSE 'FAIL' END AS status
  FROM expected_grants e
)
SELECT * FROM column_results
UNION ALL SELECT * FROM primary_keys
UNION ALL SELECT * FROM rls
UNION ALL SELECT * FROM foreign_keys
UNION ALL SELECT * FROM policies
UNION ALL SELECT * FROM grants_audit
ORDER BY section, table_name, object_name;
