import type { ReactElement } from "react";
import { render, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import tr from "@/messages/tr.json";
import az from "@/messages/az.json";
import ru from "@/messages/ru.json";

const MESSAGES = { en, tr, az, ru };

export function renderWithIntl(
  ui: ReactElement,
  locale: keyof typeof MESSAGES = "en"
): RenderResult {
  return render(
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
      {ui}
    </NextIntlClientProvider>
  );
}
