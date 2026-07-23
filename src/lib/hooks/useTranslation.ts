"use client";

import { useCallback, useMemo } from "react";
import { useSettings } from "./useSettings";
import { getTranslations, getLanguageInfo, type Translations } from "@/lib/i18n";

/** Reaches into a nested translation object with a dot-separated path, e.g.
 *  "settings.tabs.appearance". Typed loosely on purpose — the string keys
 *  used at call sites are checked structurally by TranslationKey below. */
function getByPath(obj: unknown, path: string): unknown {
	return path.split(".").reduce<unknown>((acc, part) => {
		if (acc && typeof acc === "object" && part in (acc as Record<string, unknown>)) {
			return (acc as Record<string, unknown>)[part];
		}
		return undefined;
	}, obj);
}

// Builds a union of every valid dot-path into the Translations shape, e.g.
// "common.close" | "settings.tabs.appearance" | ... — so t() call sites get
// autocomplete and a compile error on typos, without hand-maintaining the list.
type PathsOf<T, Prefix extends string = ""> = T extends string
	? Prefix extends "" ?
			never
		:	Prefix extends `${infer P}.` ? P : Prefix
	: {
			[K in keyof T & string]: PathsOf<T[K], `${Prefix}${K}.`>;
		}[keyof T & string];

export type TranslationKey = PathsOf<Translations>;

/** App-wide i18n hook. Reads `settings.general.language` from the shared
 *  settings store (see useSettings.ts) so switching the language in the
 *  Settings panel re-renders every component using this hook immediately,
 *  the same way switching the theme already does. */
export function useTranslation() {
	const { settings, hydrated } = useSettings();
	const language = settings.general.language;
	const dict = useMemo(() => getTranslations(language), [language]);
	const info = useMemo(() => getLanguageInfo(language), [language]);

	const t = useCallback(
		(key: TranslationKey): string => {
			const value = getByPath(dict, key);
			if (typeof value === "string") return value;
			// Missing key (shouldn't happen — TS enforces full coverage per
			// language — but falls back to English, then the key itself,
			// rather than rendering "undefined" if something slips through).
			const fallback = getByPath(getTranslations("en"), key);
			return typeof fallback === "string" ? fallback : key;
		},
		[dict],
	);

	return { t, language, dir: info.dir, hydrated };
}
