import { getGraphemeSegmenter, visibleWidth } from "@earendil-works/pi-tui";

/**
 * Wraps plain text to `width` columns, breaking only at spaces. senpi's own wrapping treats every Hangul
 * syllable as a break point (as it does for CJK ideographs) and so splits Korean words across lines; text
 * that already arrives broken at word boundaries never needs that. Newlines are kept, and a single word
 * wider than `width` is cut between graphemes.
 */
export function wrapWords(text: string, width: number): string[] {
	const limit = Math.max(1, width);
	const lines: string[] = [];
	for (const paragraph of text.split("\n")) {
		let line = "";
		let lineWidth = 0;
		for (const word of paragraph.split(" ")) {
			const wordWidth = visibleWidth(word);
			if (line !== "" && lineWidth + 1 + wordWidth <= limit) {
				line += ` ${word}`;
				lineWidth += 1 + wordWidth;
				continue;
			}
			if (line !== "") lines.push(line);
			line = word;
			lineWidth = wordWidth;
			while (lineWidth > limit) {
				const head = headWithin(line, limit);
				lines.push(head);
				line = line.slice(head.length);
				lineWidth = visibleWidth(line);
			}
		}
		lines.push(line);
	}
	return lines;
}

function headWithin(text: string, limit: number): string {
	let head = "";
	for (const { segment } of getGraphemeSegmenter().segment(text)) {
		if (head !== "" && visibleWidth(head + segment) > limit) break;
		head += segment;
	}
	return head;
}
