import { getRequestConfig } from "next-intl/server";
import { getUiLocale } from "@/lib/i18n/request-prefs";

export default getRequestConfig(async () => {
  const locale = await getUiLocale();
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
