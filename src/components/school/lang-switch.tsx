import { LOCALES } from "@/lib/school/i18n";
import { useI18n } from "@/lib/school/locale";

export function LangSwitch() {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      <span className="sr-only">{t("language")}</span>
      <select
        className="h-11 rounded-md border border-border bg-surface px-3 text-sm text-fg"
        value={locale}
        onChange={(event) => setLocale(event.target.value as typeof locale)}
        aria-label={t("language")}
      >
        {LOCALES.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}
