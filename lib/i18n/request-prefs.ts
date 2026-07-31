import { cookies } from "next/headers";
import {
  DEFAULT_LOCALE,
  DEFAULT_EDITION_BY_LOCALE,
  LOCALE_COOKIE,
  EDITION_COOKIE,
  isValidLocale,
  isValidEdition,
  type Locale,
} from "@/lib/i18n/config";

/**
 * Server-only cookie readers for the locale/translation-edition preference.
 * Both values are whitelist-validated before use — a cookie is client-writable,
 * so an invalid or tampered value must fail closed to the default rather than
 * ever being interpolated into a URL or SQL query.
 */

export async function getUiLocale(): Promise<Locale> {
  const store = await cookies();
  const raw = store.get(LOCALE_COOKIE)?.value;
  return raw && isValidLocale(raw) ? raw : DEFAULT_LOCALE;
}

export async function getQuranEdition(): Promise<string> {
  const store = await cookies();
  const raw = store.get(EDITION_COOKIE)?.value;
  if (raw && isValidEdition(raw)) return raw;
  const locale = await getUiLocale();
  return DEFAULT_EDITION_BY_LOCALE[locale];
}
