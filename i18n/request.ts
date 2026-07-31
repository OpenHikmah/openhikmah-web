import { getRequestConfig } from "next-intl/server";
import { getUiLocale } from "@/lib/i18n/request-prefs";

export default getRequestConfig(async () => {
  const locale = await getUiLocale();
  return {
    locale,
    // Fixed rather than server-local: the server's OS timezone has no relation to
    // any given visitor's, and an unset value makes next-intl warn on every
    // render that formats a date (e.g. CanvasToolbar/Header's saved-workspace
    // name). UTC keeps SSR output deterministic; exact wall-clock time isn't
    // load-bearing for the short dates shown here.
    timeZone: "UTC",
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
