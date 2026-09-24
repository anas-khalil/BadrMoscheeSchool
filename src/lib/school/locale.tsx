import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isLocale, translate, type Msg } from "./i18n";
import type { Locale } from "./types";

const KEY = "badr-school-locale";

type I18n = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: Msg) => string;
  dir: "ltr" | "rtl";
};

const I18nContext = createContext<I18n | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    if (saved && isLocale(saved)) setLocaleState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    localStorage.setItem(KEY, locale);
  }, [locale]);

  const value = useMemo<I18n>(
    () => ({
      locale,
      setLocale: setLocaleState,
      t: (key) => translate(locale, key),
      dir: locale === "ar" ? "rtl" : "ltr",
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n outside provider");
  return ctx;
}
