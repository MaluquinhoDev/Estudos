-- AVA / PowerSync schema audit (read-only)
-- Execute no SQL Editor do projeto Supabase.
-- Não cria, altera ou concede permissões. Mostra tipos reais, PKs, FKs,
-- estado do RLS e expressões completas das políticas para revisão manual.

WITH expected_columns(table_name, column_name, expected_type, expected_nullable) AS (
  VALUES
    ('profiles','id','uuid','NO'),
    ('profiles','display_name','text','YES'),
    ('profiles','created_at','timestamp with time zone','NO'),
    ('profiles','updated_at','timestamp with time zone','NO'),

    ('courses','id','text','NO'),
    ('courses','user_id','uuid','NO'),
    ('courses','title','text','NO'),
    ('courses','category','text','NO'),
    ('courses','description','text','NO'),
    ('courses','created_at','timestamp with time zone','NO'),
    ('courses','updated_at','timestamp with time zone','NO'),

    ('modules','id','text','NO'),
    ('modules','user_id','uuid','NO'),
    ('modules','course_id','text','NO'),
    ('modules','title','text','NO'),
    ('modules','position','integer','NO'),
    ('modules','created_at','timestamp with time zone','NO'),
    ('modules','updated_at','timestamp with time zone','NO'),

    ('lessons','id','text','NO'),
    ('lessons','user_id','uuid','NO'),
    ('lessons','course_id','text','NO'),
    ('lessons','module_id','text','NO'),
    ('lessons','title','text','NO'),
    ('lessons','description','text','NO'),
    ('lessons','notes','text','NO'),
    ('lessons','status','text','NO'),
    ('lessons','created_at','timestamp with time zone','NO'),
    ('lessons','updated_at','timestamp with time zone','NO'),

    ('review_cards','id','text','NO'),
    ('review_cards','user_id','uuid','NO'),
    ('review_cards','course_id','text','YES'),
    ('review_cards','lesson_id','text','YES'),
    ('review_cards','course_title','text','NO'),
    ('review_cards','front','text','NO'),
    ('review_cards','back','text','NO'),
    ('review_cards','due','date','YES'),
    ('review_cards','interval','integer','NO'),
    ('review_cards','repetitions','integer','NO'),
    ('review_cards','last_reviewed','date','YES'),
    ('review_cards','created_at','timestamp with time zone','NO'),
    ('review_cards','updated_at','timestamp with time zone','NO'),

    ('resources','id','text','NO'),
    ('resources','user_id','uuid','NO'),
    ('resources','course_id','text','YES'),
    ('resources','title','text','NO'),
    ('resources','type','text','NO'),
    ('resources','url','text','NO'),
    ('resources','description','text','NO'),
    ('resources','course_title','text','NO'),
    ('resources','created_at','timestamp with time zone','NO'),
    ('resources','updated_at','timestamp with time zone','NO')
),
column_results AS (
  SELECT
    'COLUMN'::text AS section,
    e.table_name,
    e.column_name AS object_name,
    COALESCE(c.data_type, 'MISSING') || '; nullable=' ||
      COALESCE(c.is_nullable, 'UNKNOWN') AS actual,
    e.expected_type || '; nullable=' || e.expected_nullable AS expected,
    CASE
      WHEN c.column_name IS NULL THEN 'FAIL'
      WHEN c.data_type = e.expected_type AND c.is_nullable = e.expected_nullable THEN 'PASS'
      ELSE 'REVIEW'
    END AS status
  FROM expected_columns e
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public'
   AND c.table_name = e.table_name
   AND c.column_name = e.column_name
),
primary_keys AS (
  SELECT
    'PRIMARY_KEY'::text AS section,
    t.table_name,
    'primary key'::text AS object_name,
    COALESCE(string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position), 'MISSING') AS actual,
    'id (single column)'::text AS expected,
    CASE
      WHEN count(kcu.column_name) = 1 AND min(kcu.column_name) = 'id' THEN 'PASS'
      ELSE 'FAIL'
    END AS status
  FROM (VALUES ('profiles'),('courses'),('modules'),('lessons'),('review_cards'),('resources')) AS t(table_name)
  LEFT JOIN information_schema.table_constraints tc
    ON tc.table_schema = 'public'
   AND tc.table_name = t.table_name
   AND tc.constraint_type = 'PRIMARY KEY'
  LEFT JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_schema = tc.constraint_schema
   AND kcu.constraint_name = tc.constraint_name
  GROUP BY t.table_name
),
rls AS (
  SELECT
    'RLS'::text AS section,
    t.table_name,
    'row level security'::text AS object_name,
    COALESCE(c.relrowsecurity::text, 'TABLE MISSING') AS actual,
    'true'::text AS expected,
    CASE WHEN c.relrowsecurity THEN 'PASS' ELSE 'FAIL' END AS status
  FROM (VALUES ('profiles'),('courses'),('modules'),('lessons'),('review_cards'),('resources')) AS t(table_name)
  LEFT JOIN pg_class c ON c.oid = to_regclass('public.' || t.table_name)
),
foreign_keys AS (
  SELECT
    'FOREIGN_KEY'::text AS section,
    tc.table_name,
    kcu.column_name AS object_name,
    'references ' || ccu.table_name || '(' || ccu.column_name || ')' AS actual,
    'Inspect relationship and ownership consistency'::text AS expected,
    'REVIEW'::text AS status
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_schema = tc.constraint_schema
   AND kcu.constraint_name = tc.constraint_name
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_schema = tc.constraint_schema
   AND ccu.constraint_name = tc.constraint_name
  WHERE tc.constraint_schema = 'public'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name IN ('profiles','courses','modules','lessons','review_cards','resources')
),
policies AS (
  SELECT
    'POLICY'::text AS section,
    p.tablename AS table_name,
    p.policyname AS object_name,
    'roles=' || p.roles::text || '; command=' || p.cmd ||
      '; USING=' || COALESCE(p.qual, 'NULL') ||
      '; WITH CHECK=' || COALESCE(p.with_check, 'NULL') AS actual,
    'Manually verify owner restriction using auth.uid()'::text AS expected,
    'REVIEW'::text AS status
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename IN ('profiles','courses','modules','lessons','review_cards','resources')
)
SELECT * FROM column_results
UNION ALL SELECT * FROM primary_keys
UNION ALL SELECT * FROM rls
UNION ALL SELECT * FROM foreign_keys
UNION ALL SELECT * FROM policies
ORDER BY section, table_name, object_name;
