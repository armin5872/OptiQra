"use client";

import { useTranslation } from "@/lib/hooks/useTranslation";

export default function SiteFooter() {
	const { t } = useTranslation();
	return (
		<footer className="site-footer">
			<span>{t("footer.madeBy")}</span>{" "}
			<a href="https://github.com/armin5872/OptiQra" target="_blank" rel="noopener noreferrer">
				ArminNX and the community
			</a>
		</footer>
	);
}
