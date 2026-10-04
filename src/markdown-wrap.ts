import { visibleWidth } from "@earendil-works/pi-tui";

/** Hangul syllables and jamo: the one script whose words senpi's wrapping splits. */
const HANGUL = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const QUOTE = /^(?: {0,3}> ?)+/;
/** Lines the renderer lays out on its own terms: tables, headings and HTML. */
const VERBATIM = /^ {0,3}(?:\||#{1,6}(?:\s|$)|<)/;
const LIST_ITEM = /^( *)([-*+]|\d{1,9}[.)])( +)(\[[ xX]\] +)?(?=\S)/;
/** Indented code, or a continuation nested too deep to place reliably. */
const DEEP_INDENT = /^(?: {4}|\t)/;
/** A word that could open a new block if a line began with it; a line break never goes right before one. */
const BLOCK_OPENER = /^(?:[-*+=>|<#]|\d{1,9}[.)]|`{3}|~{3})/;
/** senpi indents each nested list level by four columns and draws a quote level as a two-column bar. */
const LIST_LEVEL_COLUMNS = 4;
const QUOTE_COLUMNS = 2;
const TASK_BOX_COLUMNS = 4;
const MIN_ROOM = 8;

/**
 * Re-breaks Korean prose at word boundaries for `width` columns, before senpi's renderer splits words.
 * The renderer keeps every newline inside a paragraph as a line break, so the inserted breaks show exactly
 * where they are placed; list items and quotes get continuation lines that stay inside them. Lines without
 * Hangul, code, tables and headings pass through unchanged. Widths count markup characters too, so a line
 * can only come out shorter than the renderer would allow, never longer.
 */
export function prewrapMarkdown(markdown: string, width: number): string {
	if (!HANGUL.test(markdown)) return markdown;
	let fence = "";
	return markdown
		.split("\n")
		.map((line) => {
			const marker = FENCE.exec(line)?.[1];
			if (fence !== "") {
				if (marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length) fence = "";
				return line;
			}
			if (marker !== undefined) {
				fence = marker;
				return line;
			}
			return HANGUL.test(line) ? rewrapLine(line, width) : line;
		})
		.join("\n");
}

function rewrapLine(line: string, width: number): string {
	const quote = QUOTE.exec(line)?.[0] ?? "";
	const body = line.slice(quote.length);
	if (VERBATIM.test(body)) return line;
	const item = LIST_ITEM.exec(body);
	if (!item && DEEP_INDENT.test(body)) return line;
	const lead = item?.[0] ?? /^ */.exec(body)?.[0] ?? "";
	const quoteColumns = (quote.match(/>/g)?.length ?? 0) * QUOTE_COLUMNS;
	// Paragraph text indented 1-3 spaces is a list continuation at most; doubling its indent stays on the safe side.
	const leadColumns = item ? renderedListLead(item[1] ?? "", item[2] ?? "", item[4] !== undefined) : lead.length * 2;
	const room = width - quoteColumns - leadColumns;
	if (room < MIN_ROOM) return line;
	const rows = packWords(splitWords(body.slice(lead.length)), room);
	if (rows.length < 2) return line;
	return quote + lead + rows.join(`\n${quote}${" ".repeat(lead.length)}`);
}

function renderedListLead(indent: string, marker: string, task: boolean): number {
	const level = Math.ceil(indent.length / 2);
	const markerColumns = /^[-*+]$/.test(marker) ? 2 : marker.length + 1;
	return level * LIST_LEVEL_COLUMNS + markerColumns + (task ? TASK_BOX_COLUMNS : 0);
}

/** Splits at spaces, except inside code spans and link syntax, where a break would change the markup. */
function splitWords(text: string): string[] {
	const words: string[] = [];
	let word = "";
	let codeFence = 0;
	let linkTextDepth = 0;
	let linkTargetDepth = 0;
	for (let index = 0; index < text.length; index++) {
		const char = text.charAt(index);
		if (char === "`") {
			let run = 1;
			while (text.charAt(index + run) === "`") run++;
			const ticks = text.slice(index, index + run);
			// An unclosed run is literal text in Markdown, not the start of a code span.
			if (run === codeFence) codeFence = 0;
			else if (codeFence === 0 && text.includes(ticks, index + run)) codeFence = run;
			word += ticks;
			index += run - 1;
			continue;
		}
		if (codeFence === 0) {
			if (char === "[" && text.includes("](", index)) linkTextDepth++;
			else if (char === "]" && linkTextDepth > 0) linkTextDepth--;
			else if (char === "(" && (linkTargetDepth > 0 || text.charAt(index - 1) === "]")) linkTargetDepth++;
			else if (char === ")" && linkTargetDepth > 0) linkTargetDepth--;
			else if (char === " " && linkTextDepth === 0 && linkTargetDepth === 0) {
				words.push(word);
				word = "";
				continue;
			}
		}
		word += char;
	}
	words.push(word);
	return words;
}

/** Greedy packing into rows of `room` columns. A word that would open a block takes the previous word down with it. */
function packWords(words: readonly string[], room: number): string[] {
	const rows: string[][] = [];
	let row: string[] = [];
	let used = 0;
	for (const word of words) {
		const size = visibleWidth(word);
		// Empty words come from repeated spaces; they stay where they are, including a trailing hard break.
		if (row.length === 0 || word === "" || used + 1 + size <= room) {
			used += (row.length === 0 ? 0 : 1) + size;
			row.push(word);
			continue;
		}
		if (BLOCK_OPENER.test(word)) {
			const previous = row.at(-1) ?? "";
			if (row.length < 2 || previous === "" || BLOCK_OPENER.test(previous)) {
				used += 1 + size;
				row.push(word);
				continue;
			}
			rows.push(row.slice(0, -1));
			row = [previous, word];
			used = visibleWidth(previous) + 1 + size;
			continue;
		}
		rows.push(row);
		row = [word];
		used = size;
	}
	rows.push(row);
	return rows.map((words) => words.join(" "));
}
