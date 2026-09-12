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
--
-- Deliberately NOT using \set ON_ERROR_STOP: this script runs 6 independent
-- checks, and one section hitting a bad row should still let the other 5 run
-- and report — aborting on the first error would hide everything after it,
-- which is worse for a one-shot diagnostic than a gap in one section.
--
-- name_content.data is unconstrained text. The pairings/verses checks below
-- guard against valid-JSON-but-wrong-shape rows (jsonb_typeof = 'array') since
-- the app always writes an array for those kinds — a non-array row would mean
-- something outside normal app writes touched the table. Genuinely malformed
-- JSON syntax (not just wrong shape) isn't guarded — Postgres has no cheap
-- try-cast for jsonb without a custom function, and the actual writer
-- (cleanup-566-ai-content.mjs) already fails safe on that case: JSON.parse()
-- throwing there aborts its whole transaction with zero writes, rather than
-- silently skipping or partially applying anything.

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
WITH pairings_shaped AS (
  SELECT slug, locale, model, updated_at, data::jsonb AS data
  FROM name_content
  WHERE kind = 'pairings' AND jsonb_typeof(data::jsonb) = 'array'
),
pairing_items AS (
  SELECT
    nc.slug,
    nc.locale,
    nc.model,
    nc.updated_at,
    elem ->> 'name' AS name,
    elem ->> 'transliteration' AS transliteration,
    elem ->> 'explanation' AS explanation
  FROM pairings_shaped nc,
       jsonb_array_elements(nc.data) AS elem
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
  FROM (
    SELECT slug, locale, model, updated_at, data::jsonb AS data
    FROM name_content
    WHERE kind = 'pairings' AND jsonb_typeof(data::jsonb) = 'array'
  ) nc,
       jsonb_array_elements(nc.data) AS elem
) p
WHERE name IS NULL OR btrim(name) = ''
   OR btrim(coalesce(explanation, '')) = ''
   OR explanation ~* $re$^\s*(i(['’ ]?a?m)? (sorry|unable|not able)\y|i can(not|['’]t)\y|i (can(not|['’]t)|won['’]t|will not) (help|assist|provide|comply|generate|write)\y|i (must|have to) decline\y|i['’]m not (going to|able to)\y|as an ai\y|as a language model\y|i (apologi[sz]e|cannot in good conscience)\y|unfortunately,? +i)$re$
ORDER BY updated_at
LIMIT 20;

\echo ''
\echo '=== 5. name_content (verses): blank or refusal-looking per-verse reason ==='
WITH verses_shaped AS (
  SELECT slug, locale, model, updated_at, data::jsonb AS data
  FROM name_content
  WHERE kind = 'verses' AND jsonb_typeof(data::jsonb) = 'array'
),
verse_items AS (
  SELECT
    nc.slug,
    nc.locale,
    nc.model,
    nc.updated_at,
    elem ->> 'ref' AS ref,
    elem ->> 'reason' AS reason
  FROM verses_shaped nc,
       jsonb_array_elements(nc.data) AS elem
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
  FROM (
    SELECT slug, locale, model, updated_at, data::jsonb AS data
    FROM name_content
    WHERE kind = 'verses' AND jsonb_typeof(data::jsonb) = 'array'
  ) nc,
       jsonb_array_elements(nc.data) AS elem
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
  FROM (
    SELECT data::jsonb AS data FROM name_content
    WHERE kind = 'pairings' AND jsonb_typeof(data::jsonb) = 'array'
  ) nc, jsonb_array_elements(nc.data) AS elem
) p
WHERE name IS NULL OR btrim(name) = ''
   OR btrim(coalesce(explanation, '')) = ''
   OR explanation ~* $re$^\s*(i(['’ ]?a?m)? (sorry|unable|not able)\y|i can(not|['’]t)\y|i (can(not|['’]t)|won['’]t|will not) (help|assist|provide|comply|generate|write)\y|i (must|have to) decline\y|i['’]m not (going to|able to)\y|as an ai\y|as a language model\y|i (apologi[sz]e|cannot in good conscience)\y|unfortunately,? +i)$re$
UNION ALL
SELECT 'verses_blank_or_refusal', count(*) FROM (
  SELECT elem ->> 'reason' AS reason
  FROM (
    SELECT data::jsonb AS data FROM name_content
    WHERE kind = 'verses' AND jsonb_typeof(data::jsonb) = 'array'
  ) nc, jsonb_array_elements(nc.data) AS elem
) v
WHERE btrim(coalesce(reason, '')) = ''
   OR reason ~* $re$^\s*(i(['’ ]?a?m)? (sorry|unable|not able)\y|i can(not|['’]t)\y|i (can(not|['’]t)|won['’]t|will not) (help|assist|provide|comply|generate|write)\y|i (must|have to) decline\y|i['’]m not (going to|able to)\y|as an ai\y|as a language model\y|i (apologi[sz]e|cannot in good conscience)\y|unfortunately,? +i)$re$
UNION ALL
SELECT 'name_verse_reasons_blank_or_refusal', count(*) FROM name_verse_reasons
WHERE btrim(reason) = ''
   OR reason ~* $re$^\s*(i(['’ ]?a?m)? (sorry|unable|not able)\y|i can(not|['’]t)\y|i (can(not|['’]t)|won['’]t|will not) (help|assist|provide|comply|generate|write)\y|i (must|have to) decline\y|i['’]m not (going to|able to)\y|as an ai\y|as a language model\y|i (apologi[sz]e|cannot in good conscience)\y|unfortunately,? +i)$re$;
