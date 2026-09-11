-- Read-only audit for issue #566 (AI-generation write-path guardrails).
-- Finds rows persisted BEFORE the validation checks in lib/ai/connection-generator.ts,
-- lib/ai/refusal.ts, and app/api/names/[slug]/pairings/route.ts existed, so they
-- never went through the current bar. No INSERT/UPDATE/DELETE anywhere in this file
-- — every statement is a SELECT. Safe to run against production.
--
-- Run with:  psql "$DATABASE_URL" -f audit_566_retroactive.sql
--
-- The regex below is a SQL approximation of looksLikeRefusal() (lib/ai/refusal.ts):
-- same refusal openers, \b word boundaries swapped for Postgres's \y (Postgres
-- doesn't support \b as a word boundary the way JS does). Treat matches as
-- candidates for manual review, not an automatic verdict — false positives are
-- possible (e.g. a reflection that happens to start with "I" quoting scripture).

\pset pager off

\echo '=== 1. connections: blank or whitespace-only reason ==='
SELECT status, count(*) AS n
FROM connections
WHERE btrim(reason) = ''
GROUP BY status
ORDER BY status;

\echo '--- sample (up to 20) ---'
SELECT id, from_ref, to_ref, kind, locale, status, model, created_at
FROM connections
WHERE btrim(reason) = ''
ORDER BY created_at
LIMIT 20;

\echo ''
\echo '=== 2. connections: reason looks like a refusal opener ==='
SELECT status, locale, count(*) AS n
FROM connections
WHERE reason ~* $re$^\s*(i(['’ ]?a?m)? (sorry|unable|not able)\y|i can(not|['’]t)\y|i (can(not|['’]t)|won['’]t|will not) (help|assist|provide|comply|generate|write)\y|i (must|have to) decline\y|i['’]m not (going to|able to)\y|as an ai\y|as a language model\y|i (apologi[sz]e|cannot in good conscience)\y|unfortunately,? +i)$re$
GROUP BY status, locale
ORDER BY status, locale;

\echo '--- sample (up to 20) ---'
SELECT id, from_ref, to_ref, kind, locale, status, left(reason, 120) AS reason_preview, created_at
FROM connections
WHERE reason ~* $re$^\s*(i(['’ ]?a?m)? (sorry|unable|not able)\y|i can(not|['’]t)\y|i (can(not|['’]t)|won['’]t|will not) (help|assist|provide|comply|generate|write)\y|i (must|have to) decline\y|i['’]m not (going to|able to)\y|as an ai\y|as a language model\y|i (apologi[sz]e|cannot in good conscience)\y|unfortunately,? +i)$re$
ORDER BY created_at
LIMIT 20;

\echo ''
\echo '=== 3. name_content (reflection): blank or refusal-looking text ==='
WITH reflections AS (
  SELECT slug, locale, model, updated_at, (data::jsonb #>> '{}'::text[]) AS text
  FROM name_content
  WHERE kind = 'reflection'
)
SELECT
  count(*) FILTER (WHERE btrim(text) = '') AS blank_count,
  count(*) FILTER (
    WHERE text ~* $re$^\s*(i(['’ ]?a?m)? (sorry|unable|not able)\y|i can(not|['’]t)\y|i (can(not|['’]t)|won['’]t|will not) (help|assist|provide|comply|generate|write)\y|i (must|have to) decline\y|i['’]m not (going to|able to)\y|as an ai\y|as a language model\y|i (apologi[sz]e|cannot in good conscience)\y|unfortunately,? +i)$re$
  ) AS refusal_count
FROM reflections;

\echo '--- sample (up to 20, blank or refusal) ---'
SELECT slug, locale, model, updated_at, left(text, 120) AS text_preview
FROM (
  SELECT slug, locale, model, updated_at, (data::jsonb #>> '{}'::text[]) AS text
  FROM name_content
  WHERE kind = 'reflection'
) r
WHERE btrim(text) = ''
   OR text ~* $re$^\s*(i(['’ ]?a?m)? (sorry|unable|not able)\y|i can(not|['’]t)\y|i (can(not|['’]t)|won['’]t|will not) (help|assist|provide|comply|generate|write)\y|i (must|have to) decline\y|i['’]m not (going to|able to)\y|as an ai\y|as a language model\y|i (apologi[sz]e|cannot in good conscience)\y|unfortunately,? +i)$re$
ORDER BY updated_at
LIMIT 20;

\echo ''
\echo '=== 4. name_content (pairings): unresolved name ("") or refusal-looking explanation ==='
WITH pairing_items AS (
  SELECT
    nc.slug,
    nc.locale,
    nc.model,
    nc.updated_at,
    elem ->> 'name' AS name,
    elem ->> 'transliteration' AS transliteration,
    elem ->> 'explanation' AS explanation
  FROM name_content nc,
       jsonb_array_elements(nc.data::jsonb) AS elem
  WHERE nc.kind = 'pairings'
)
SELECT
  count(*) FILTER (WHERE name IS NULL OR btrim(name) = '') AS unresolved_name_count,
  count(*) FILTER (WHERE btrim(coalesce(explanation, '')) = '') AS blank_explanation_count,
  count(*) FILTER (
    WHERE explanation ~* $re$^\s*(i(['’ ]?a?m)? (sorry|unable|not able)\y|i can(not|['’]t)\y|i (can(not|['’]t)|won['’]t|will not) (help|assist|provide|comply|generate|write)\y|i (must|have to) decline\y|i['’]m not (going to|able to)\y|as an ai\y|as a language model\y|i (apologi[sz]e|cannot in good conscience)\y|unfortunately,? +i)$re$
  ) AS refusal_explanation_count
FROM pairing_items;

\echo '--- sample (up to 20, unresolved name or blank/refusal explanation) ---'
SELECT slug, locale, model, updated_at, name, transliteration, left(explanation, 120) AS explanation_preview
FROM (
  SELECT
    nc.slug,
    nc.locale,
    nc.model,
    nc.updated_at,
    elem ->> 'name' AS name,
    elem ->> 'transliteration' AS transliteration,
    elem ->> 'explanation' AS explanation
  FROM name_content nc,
       jsonb_array_elements(nc.data::jsonb) AS elem
  WHERE nc.kind = 'pairings'
) p
WHERE name IS NULL OR btrim(name) = ''
   OR btrim(coalesce(explanation, '')) = ''
   OR explanation ~* $re$^\s*(i(['’ ]?a?m)? (sorry|unable|not able)\y|i can(not|['’]t)\y|i (can(not|['’]t)|won['’]t|will not) (help|assist|provide|comply|generate|write)\y|i (must|have to) decline\y|i['’]m not (going to|able to)\y|as an ai\y|as a language model\y|i (apologi[sz]e|cannot in good conscience)\y|unfortunately,? +i)$re$
ORDER BY updated_at
LIMIT 20;

\echo ''
\echo '=== 5. name_content (verses): blank or refusal-looking per-verse reason ==='
WITH verse_items AS (
  SELECT
    nc.slug,
    nc.locale,
    nc.model,
    nc.updated_at,
    elem ->> 'ref' AS ref,
    elem ->> 'reason' AS reason
  FROM name_content nc,
       jsonb_array_elements(nc.data::jsonb) AS elem
  WHERE nc.kind = 'verses'
)
SELECT
  count(*) FILTER (WHERE btrim(coalesce(reason, '')) = '') AS blank_reason_count,
  count(*) FILTER (
    WHERE reason ~* $re$^\s*(i(['’ ]?a?m)? (sorry|unable|not able)\y|i can(not|['’]t)\y|i (can(not|['’]t)|won['’]t|will not) (help|assist|provide|comply|generate|write)\y|i (must|have to) decline\y|i['’]m not (going to|able to)\y|as an ai\y|as a language model\y|i (apologi[sz]e|cannot in good conscience)\y|unfortunately,? +i)$re$
  ) AS refusal_reason_count
FROM verse_items;

\echo '--- sample (up to 20) ---'
SELECT slug, locale, model, updated_at, ref, left(reason, 120) AS reason_preview
FROM (
  SELECT
    nc.slug,
    nc.locale,
    nc.model,
    nc.updated_at,
    elem ->> 'ref' AS ref,
    elem ->> 'reason' AS reason
  FROM name_content nc,
       jsonb_array_elements(nc.data::jsonb) AS elem
  WHERE nc.kind = 'verses'
) v
WHERE btrim(coalesce(reason, '')) = ''
   OR reason ~* $re$^\s*(i(['’ ]?a?m)? (sorry|unable|not able)\y|i can(not|['’]t)\y|i (can(not|['’]t)|won['’]t|will not) (help|assist|provide|comply|generate|write)\y|i (must|have to) decline\y|i['’]m not (going to|able to)\y|as an ai\y|as a language model\y|i (apologi[sz]e|cannot in good conscience)\y|unfortunately,? +i)$re$
ORDER BY updated_at
LIMIT 20;

\echo ''
\echo '=== 6. name_verse_reasons (translated per-verse reasons): blank or refusal-looking ==='
SELECT
  count(*) FILTER (WHERE btrim(reason) = '') AS blank_count,
  count(*) FILTER (
    WHERE reason ~* $re$^\s*(i(['’ ]?a?m)? (sorry|unable|not able)\y|i can(not|['’]t)\y|i (can(not|['’]t)|won['’]t|will not) (help|assist|provide|comply|generate|write)\y|i (must|have to) decline\y|i['’]m not (going to|able to)\y|as an ai\y|as a language model\y|i (apologi[sz]e|cannot in good conscience)\y|unfortunately,? +i)$re$
  ) AS refusal_count
FROM name_verse_reasons;

\echo '--- sample (up to 20) ---'
SELECT slug, ref, locale, model, created_at, left(reason, 120) AS reason_preview
FROM name_verse_reasons
WHERE btrim(reason) = ''
   OR reason ~* $re$^\s*(i(['’ ]?a?m)? (sorry|unable|not able)\y|i can(not|['’]t)\y|i (can(not|['’]t)|won['’]t|will not) (help|assist|provide|comply|generate|write)\y|i (must|have to) decline\y|i['’]m not (going to|able to)\y|as an ai\y|as a language model\y|i (apologi[sz]e|cannot in good conscience)\y|unfortunately,? +i)$re$
ORDER BY created_at
LIMIT 20;

\echo ''
\echo '=== Summary ==='
SELECT 'connections_blank' AS check, count(*) AS n FROM connections WHERE btrim(reason) = ''
UNION ALL
SELECT 'connections_refusal', count(*) FROM connections
  WHERE reason ~* $re$^\s*(i(['’ ]?a?m)? (sorry|unable|not able)\y|i can(not|['’]t)\y|i (can(not|['’]t)|won['’]t|will not) (help|assist|provide|comply|generate|write)\y|i (must|have to) decline\y|i['’]m not (going to|able to)\y|as an ai\y|as a language model\y|i (apologi[sz]e|cannot in good conscience)\y|unfortunately,? +i)$re$
UNION ALL
SELECT 'reflection_blank_or_refusal', count(*) FROM (
  SELECT (data::jsonb #>> '{}'::text[]) AS text FROM name_content WHERE kind = 'reflection'
) r
WHERE btrim(text) = ''
   OR text ~* $re$^\s*(i(['’ ]?a?m)? (sorry|unable|not able)\y|i can(not|['’]t)\y|i (can(not|['’]t)|won['’]t|will not) (help|assist|provide|comply|generate|write)\y|i (must|have to) decline\y|i['’]m not (going to|able to)\y|as an ai\y|as a language model\y|i (apologi[sz]e|cannot in good conscience)\y|unfortunately,? +i)$re$
UNION ALL
SELECT 'pairings_unresolved_or_bad', count(*) FROM (
  SELECT elem ->> 'name' AS name, elem ->> 'explanation' AS explanation
  FROM name_content, jsonb_array_elements(data::jsonb) AS elem
  WHERE kind = 'pairings'
) p
WHERE name IS NULL OR btrim(name) = ''
   OR btrim(coalesce(explanation, '')) = ''
   OR explanation ~* $re$^\s*(i(['’ ]?a?m)? (sorry|unable|not able)\y|i can(not|['’]t)\y|i (can(not|['’]t)|won['’]t|will not) (help|assist|provide|comply|generate|write)\y|i (must|have to) decline\y|i['’]m not (going to|able to)\y|as an ai\y|as a language model\y|i (apologi[sz]e|cannot in good conscience)\y|unfortunately,? +i)$re$
UNION ALL
SELECT 'verses_blank_or_refusal', count(*) FROM (
  SELECT elem ->> 'reason' AS reason
  FROM name_content, jsonb_array_elements(data::jsonb) AS elem
  WHERE kind = 'verses'
) v
WHERE btrim(coalesce(reason, '')) = ''
   OR reason ~* $re$^\s*(i(['’ ]?a?m)? (sorry|unable|not able)\y|i can(not|['’]t)\y|i (can(not|['’]t)|won['’]t|will not) (help|assist|provide|comply|generate|write)\y|i (must|have to) decline\y|i['’]m not (going to|able to)\y|as an ai\y|as a language model\y|i (apologi[sz]e|cannot in good conscience)\y|unfortunately,? +i)$re$
UNION ALL
SELECT 'name_verse_reasons_blank_or_refusal', count(*) FROM name_verse_reasons
WHERE btrim(reason) = ''
   OR reason ~* $re$^\s*(i(['’ ]?a?m)? (sorry|unable|not able)\y|i can(not|['’]t)\y|i (can(not|['’]t)|won['’]t|will not) (help|assist|provide|comply|generate|write)\y|i (must|have to) decline\y|i['’]m not (going to|able to)\y|as an ai\y|as a language model\y|i (apologi[sz]e|cannot in good conscience)\y|unfortunately,? +i)$re$;
