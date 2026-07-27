// lib/fixIntegrityGuard.ts
//
// A last-line, deterministic (no AI, no framework parser) sanity check that
// runs after every text-based fix pass on a source file (jsxAutoFix.ts) —
// the raw-text splicing engine that's most exposed to corrupting a file,
// since it doesn't have a real DOM/AST to validate against the way the
// Cheerio-based HTML engine does.
//
// The check is intentionally crude and cheap: it doesn't understand JSX or
// HTML, it just verifies that a handful of structural invariants which
// should NEVER change across a legitimate fix (every fix here only adds a
// balanced attribute or a balanced tag, never removes or half-edits one)
// actually held. If any of them didn't, something matched wrong or a
// splice landed at a bad offset — safer to throw the whole file's changes
// away and report it than ship broken source.

export interface IntegrityResult {
	ok: boolean;
	reason?: string;
}

function countOccurrences(s: string, re: RegExp): number {
	return (s.match(re) || []).length;
}

/** Checks that applying fixes to `original` → `modified` didn't destabilize
 *  the file's basic structure. Cheap on purpose — this runs on every source
 *  file in a project auto-fix pass, so it can't afford a real parse. */
export function checkTextIntegrity(original: string, modified: string, path: string): IntegrityResult {
	if (modified === original) return { ok: true };

	// A legitimate fix only ever adds attributes/tags/text — it should never
	// shrink the file. A shrink is the single strongest corruption signal
	// (a `.replace()` matched too much, or a splice landed at the wrong
	// offset and ate part of the file).
	if (modified.length < original.length) {
		return { ok: false, reason: `Auto-fix would have shrunk ${path} by ${original.length - modified.length} characters, which none of these fixes should ever do — reverted rather than risk a truncated file.` };
	}

	// Every fix here only ever inserts balanced markup — an attribute inside
	// an already-open tag, or a whole new tag with its own matching bracket.
	// So the count of `<` added should always equal the count of `>` added;
	// if they've drifted apart, a splice cut through the middle of a tag.
	const angleDelta = countOccurrences(modified, /</g) - countOccurrences(original, /</g);
	const angleCloseDelta = countOccurrences(modified, />/g) - countOccurrences(original, />/g);
	if (angleDelta !== angleCloseDelta) {
		return { ok: false, reason: `Auto-fix on ${path} left "<" and ">" counts unbalanced (${angleDelta} vs ${angleCloseDelta} added) — a fix likely spliced into the middle of a tag. Reverted this file's changes.` };
	}

	// Every inserted attribute/text value here is double-quoted, so total
	// double-quote count should stay even (an odd count means a quote got
	// opened without a matching close, i.e. a mangled attribute).
	const quoteCount = countOccurrences(modified, /"/g);
	if (quoteCount % 2 !== 0) {
		return { ok: false, reason: `Auto-fix on ${path} left an odd number of double quotes, meaning an attribute value likely didn't close properly. Reverted this file's changes.` };
	}

	// JSX/TSX files specifically: curly-brace expressions are common and
	// none of these fixers ever intentionally add/remove a `{`/`}` — a
	// drifted count there usually means a fix collided with an existing
	// expression (e.g. spliced text into the middle of `{condition && <X/>}`).
	if (/\.(tsx|jsx)$/.test(path)) {
		const openDelta = countOccurrences(modified, /\{/g) - countOccurrences(original, /\{/g);
		const closeDelta = countOccurrences(modified, /\}/g) - countOccurrences(original, /\}/g);
		if (openDelta !== closeDelta) {
			return { ok: false, reason: `Auto-fix on ${path} left "{" and "}" counts unbalanced — a fix likely collided with an existing JSX expression. Reverted this file's changes.` };
		}
	}

	// The angle-bracket balance check above only catches a delta between
	// *added* opens and closes — it's blind to a truncation that drops a
	// matched open/close pair together (e.g. a fix's `.replace()` accidentally
	// consuming through to a tag's end and losing its closing tag), since
	// that removes one `<` and one `>` in equal measure and nets to zero.
	// Counting closing tags by name catches that: nothing here ever removes
	// an existing closing tag, so every tag name's count should only ever
	// stay the same or go up (new tags of a kind, e.g. an inserted <meta>,
	// don't have separate closers to worry about since they're void/self-
	// closing; but any *paired* tag — a, div, section, title, head, html,
	// body, button, span, p, li — should never see its closer count drop).
	const closingTagCounts = (s: string): Map<string, number> => {
		const counts = new Map<string, number>();
		for (const m of s.matchAll(/<\/([A-Za-z][\w.-]*)>/g)) {
			const name = m[1].toLowerCase();
			counts.set(name, (counts.get(name) || 0) + 1);
		}
		return counts;
	};
	const originalClosers = closingTagCounts(original);
	const modifiedClosers = closingTagCounts(modified);
	for (const [name, count] of originalClosers) {
		if ((modifiedClosers.get(name) || 0) < count) {
			return { ok: false, reason: `Auto-fix on ${path} lost at least one closing </${name}> tag that was present before the fix — a fix likely truncated part of the file. Reverted this file's changes.` };
		}
	}

	return { ok: true };
}
