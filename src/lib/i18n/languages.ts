/** Every language OptiQra's UI can be switched to, plus the metadata needed
 *  to render a sensible picker and set the right <html lang>/dir. Keep this
 *  list and the `translations/` directory in sync — `npm run type-check`
 *  will fail loudly if a translation file is missing a key, but won't catch
 *  a language added here without a matching file (see i18n/index.ts). */
export type LanguageCode =
	| "en"
	| "es"
	| "fr"
	| "de"
	| "zh"
	| "ru"
	| "nl"
	| "fa"
	| "ko"
	| "ja"
	| "it"
	| "ar"
	| "hi";

export interface LanguageInfo {
	code: LanguageCode;
	/** Name shown in English, used in a few dev-facing spots/tooltips. */
	englishName: string;
	/** Name shown in the language's own script — what the picker displays. */
	nativeName: string;
	dir: "ltr" | "rtl";
}

export const LANGUAGES: LanguageInfo[] = [
	{ code: "en", englishName: "English", nativeName: "English", dir: "ltr" },
	{ code: "es", englishName: "Spanish", nativeName: "Español", dir: "ltr" },
	{ code: "fr", englishName: "French", nativeName: "Français", dir: "ltr" },
	{ code: "de", englishName: "German", nativeName: "Deutsch", dir: "ltr" },
	{ code: "zh", englishName: "Chinese", nativeName: "中文", dir: "ltr" },
	{ code: "ru", englishName: "Russian", nativeName: "Русский", dir: "ltr" },
	{ code: "nl", englishName: "Dutch", nativeName: "Nederlands", dir: "ltr" },
	{ code: "fa", englishName: "Persian", nativeName: "فارسی", dir: "rtl" },
	{ code: "ko", englishName: "Korean", nativeName: "한국어", dir: "ltr" },
	{ code: "ja", englishName: "Japanese", nativeName: "日本語", dir: "ltr" },
	{ code: "it", englishName: "Italian", nativeName: "Italiano", dir: "ltr" },
	{ code: "ar", englishName: "Arabic", nativeName: "العربية", dir: "rtl" },
	{ code: "hi", englishName: "Hindi", nativeName: "हिन्दी", dir: "ltr" },
];

export const DEFAULT_LANGUAGE: LanguageCode = "en";

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code) as LanguageCode[];

export function isLanguageCode(value: unknown): value is LanguageCode {
	return typeof value === "string" && (LANGUAGE_CODES as string[]).includes(value);
}

export function getLanguageInfo(code: LanguageCode): LanguageInfo {
	return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}
