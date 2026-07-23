import type { LanguageCode } from "./languages";
import type { Translations } from "./translations/en";
import en from "./translations/en";
import es from "./translations/es";
import fr from "./translations/fr";
import de from "./translations/de";
import zh from "./translations/zh";
import ru from "./translations/ru";
import nl from "./translations/nl";
import fa from "./translations/fa";
import ko from "./translations/ko";
import ja from "./translations/ja";
import it from "./translations/it";
import ar from "./translations/ar";
import hi from "./translations/hi";

export const TRANSLATIONS: Record<LanguageCode, Translations> = {
	en,
	es,
	fr,
	de,
	zh,
	ru,
	nl,
	fa,
	ko,
	ja,
	it,
	ar,
	hi,
};

export function getTranslations(code: LanguageCode): Translations {
	return TRANSLATIONS[code] ?? TRANSLATIONS.en;
}

export type { Translations };
export * from "./languages";
