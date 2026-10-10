import { stripVTControlCharacters } from "node:util";

export const FOOTER_LINKS_ENTRY_TYPE = "pi-customization:footer-links";
export const MAX_FOOTER_LINKS = 8;

export type FooterLink = {
	label: string;
	url: string;
};

type SessionEntryLike = {
	type?: string;
	customType?: string;
	data?: unknown;
};

function cleanLabel(value: string): string {
	return stripVTControlCharacters(value).replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();
}

function cleanUrl(value: string): string {
	const url = value.trim();
	if (stripVTControlCharacters(url) !== url || /[\r\n\t]/u.test(url)) {
		throw new Error("Footer link URLs cannot contain terminal or whitespace control characters.");
	}

	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error(`Invalid footer link URL: ${url}`);
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new Error(`Footer links must use http or https: ${url}`);
	}
	return url;
}

/** Validate, sanitize, and deduplicate the complete footer link list. */
export function normalizeFooterLinks(value: unknown): FooterLink[] {
	if (!Array.isArray(value)) throw new Error("Footer links must be an array.");
	if (value.length > MAX_FOOTER_LINKS) {
		throw new Error(`Footer links are limited to ${MAX_FOOTER_LINKS} items.`);
	}

	const links: FooterLink[] = [];
	const seenUrls = new Set<string>();
	for (const candidate of value) {
		if (!candidate || typeof candidate !== "object") throw new Error("Each footer link must have a label and URL.");
		const { label: rawLabel, url: rawUrl } = candidate as Partial<FooterLink>;
		if (typeof rawLabel !== "string" || typeof rawUrl !== "string") {
			throw new Error("Each footer link must have a string label and URL.");
		}

		const label = cleanLabel(rawLabel);
		if (!label) throw new Error("Footer link labels cannot be empty.");
		if (label.length > 32) throw new Error(`Footer link labels are limited to 32 characters: ${label}`);
		if (rawUrl.length > 2_048) throw new Error(`Footer link URLs are limited to 2048 characters: ${label}`);
		const url = cleanUrl(rawUrl);
		if (seenUrls.has(url)) continue;
		seenUrls.add(url);
		links.push({ label, url });
	}
	return links;
}

/** Restore the latest branch-local snapshot; malformed snapshots fail closed. */
export function footerLinksFromBranch(entries: readonly SessionEntryLike[]): FooterLink[] {
	for (let index = entries.length - 1; index >= 0; index--) {
		const entry = entries[index];
		if (entry.type !== "custom" || entry.customType !== FOOTER_LINKS_ENTRY_TYPE) continue;
		const data = entry.data as { version?: unknown; links?: unknown } | undefined;
		if (data?.version !== 1) return [];
		try {
			return normalizeFooterLinks(data.links);
		} catch {
			return [];
		}
	}
	return [];
}
