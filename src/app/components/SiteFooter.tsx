"use client";

import { useTranslation } from "@/lib/hooks/useTranslation";

export default function SiteFooter() {
	const { t } = useTranslation();
	return (
		<footer className="wrap flex items-center gap-1.5 py-8 text-sm text-ink-soft">
			<span>{t("footer.madeBy")}</span>
			<a
				href="https://github.com/armin5872/OptiQra"
				target="_blank"
				rel="noopener noreferrer"
				className="font-medium text-ink underline decoration-line underline-offset-2 hover:text-brand hover:decoration-brand"
			>
				ArminNX and the community
			</a>
		</footer>
	);
}
