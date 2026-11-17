-- AVA / PowerSync schema preflight
-- Somente leitura: não cria, altera ou concede permissões a nenhum objeto.
-- Execute no SQL Editor do projeto Supabase antes de implantar migrations.

WITH expected(table_name, required_columns) AS (
  VALUES
    ('profiles', ARRAY['id','display_name','created_at','updated_at']::text[]),
    ('courses', ARRAY['id','user_id','title','category','description','created_at','updated_at']::text[]),
    ('modules', ARRAY['id','user_id','course_id','title','position','created_at','updated_at']::text[]),
    ('lessons', ARRAY['id','user_id','course_id','module_id','title','description','notes','status','created_at','updated_at']::text[]),
    ('review_cards', ARRAY['id','user_id','course_id','lesson_id','course_title','front','back','due','interval','repetitions','last_reviewed','created_at','updated_at']::text[]),
    ('resources', ARRAY['id','user_id','course_id','title','type','url','description','course_title','created_at','updated_at']::text[])
), checks AS (
  SELECT e.table_name, 'table_exists'::text AS check_name,
         to_regclass(format('public.%I', e.table_name)) IS NOT NULL AS passed
  FROM expected e
  UNION ALL
  SELECT e.table_name, 'required_columns',
         NOT EXISTS (
           SELECT 1 FROM unnest(e.required_columns) c(column_name)
           WHERE NOT EXISTS (
             SELECT 1 FROM information_schema.columns ic
             WHERE ic.table_schema = 'public'
               AND ic.table_name = e.table_name
               AND ic.column_name = c.column_name
           )
         )
  FROM expected e
  UNION ALL
  SELECT e.table_name, 'primary_key_id',
         EXISTS (
           SELECT 1
           FROM pg_constraint con
           JOIN pg_class rel ON rel.oid = con.conrelid
           JOIN pg_namespace ns ON ns.oid = rel.relnamespace
           JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
           WHERE ns.nspname = 'public' AND rel.relname = e.table_name
             AND con.contype = 'p'
           GROUP BY con.oid
           HAVING count(*) = 1 AND bool_and(att.attname = 'id')
         )
  FROM expected e
  UNION ALL
  SELECT e.table_name, 'rls_enabled',
         COALESCE((SELECT rel.relrowsecurity
                   FROM pg_class rel JOIN pg_namespace ns ON ns.oid = rel.relnamespace
                   WHERE ns.nspname = 'public' AND rel.relname = e.table_name), false)
  FROM expected e
  UNION ALL
  SELECT e.table_name, 'authenticated_policy_exists',
         EXISTS (
           SELECT 1 FROM pg_policies p
           WHERE p.schemaname = 'public' AND p.tablename = e.table_name
             AND ('authenticated' = ANY(p.roles) OR 'public' = ANY(p.roles))
         )
  FROM expected e
)
SELECT table_name, check_name,
       CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result
FROM checks
ORDER BY table_name,
         CASE check_name
           WHEN 'table_exists' THEN 1
           WHEN 'required_columns' THEN 2
           WHEN 'primary_key_id' THEN 3
           WHEN 'rls_enabled' THEN 4
           ELSE 5
         END;
