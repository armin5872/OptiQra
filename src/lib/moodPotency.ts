/**
 * "AI mood potency" is a second axis on top of `InsightsMood` (settingsStore.ts):
 * mood picks *which* persona the AI writes in, potency controls *how hard*
 * it leans into that persona, from barely-there to all-the-way-in.
 *
 * Only meaningful when a mood other than "normal" is selected — "normal" has
 * no persona to turn up, so the slider is hidden for it (see SettingsPanel).
 */

export interface MoodPotencyBand {
	id: string;
	label: string;
	min: number;
	max: number;
	/** Hex color used for the slider fill, value badge, and band label. */
	color: string;
	/** Short description shown under the slider in Settings. */
	desc: string;
	/** Appended to the mood's own voice instructions in the AI system prompt. */
	promptModifier: string;
}

export const MOOD_POTENCY_BANDS: MoodPotencyBand[] = [
	{
		id: "normal",
		label: "Normal",
		min: 1,
		max: 20,
		color: "#8a8f98",
		desc: "Barely-there — a light touch of the mood over an otherwise plain voice.",
		promptModifier:
			" Keep the persona light — just a hint of the selected mood's voice, well short of a full character performance.",
	},
	{
		id: "seasoned",
		label: "Seasoned",
		min: 21,
		max: 40,
		color: "#22a6b3",
		desc: "Noticeably flavored — the mood comes through clearly but stays restrained.",
		promptModifier:
			" Turn the persona up a bit past baseline — let the selected mood color the word choice and tone noticeably, while staying restrained overall.",
	},
	{
		id: "balanced",
		label: "Balanced",
		min: 41,
		max: 60,
		color: "#2ecc71",
		desc: "Full strength — the mood is confidently front-and-center.",
		promptModifier:
			" Play the persona at full, confident strength — the selected mood should read as the clearly dominant voice throughout.",
	},
	{
		id: "wild",
		label: "Wild",
		min: 61,
		max: 80,
		color: "#ff9500",
		desc: "Turned way up — bold and exaggerated, leaning hard into the persona.",
		promptModifier:
			" Lean hard into the persona — exaggerate the selected mood's traits and take more stylistic risks than usual, don't hold back.",
	},
	{
		id: "extreme",
		label: "Extreme",
		min: 81,
		max: 100,
		color: "#ff3b30",
		desc: "As far as it goes — an extremely intense, maxed-out version of the persona.",
		promptModifier:
			" Go all the way in on the persona — an extremely intense, maximalist take on the selected mood, pushed as far as it can go. Every individual claim must still be real and traceable to the data; the intensity is stylistic, the substance stays completely accurate.",
	},
];

export function getMoodPotencyBand(value: number): MoodPotencyBand {
	const v = Math.max(1, Math.min(100, Math.round(value)));
	return (
		MOOD_POTENCY_BANDS.find((b) => v >= b.min && v <= b.max) ??
		MOOD_POTENCY_BANDS[2]
	);
}
