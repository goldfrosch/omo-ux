import type { Theme } from "@code-yeongyu/senpi";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

/** Pads or truncates styled text to exactly `width` visible columns. */
export function fit(text: string, width: number): string {
	if (width <= 0) return "";
	const clipped = visibleWidth(text) > width ? truncateToWidth(text, width) : text;
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

/** `left` and `right` on one line of exactly `width` columns; `left` gives way first. */
export function joinEnds(left: string, right: string, width: number): string {
	const room = width - visibleWidth(right) - 1;
	if (room <= 0) return fit(right, width);
	return `${fit(left, room)} ${right}`;
}

export interface Frame {
	readonly innerWidth: number;
	top(title: string, tail?: string): string;
	row(content: string, background?: (text: string) => string): string;
	rule(): string;
	bottom(): string;
}

/** Rounded, opaque panel in the opencode dialog style; every line is exactly `width` columns. */
export function createFrame(theme: Theme, width: number): Frame {
	const innerWidth = Math.max(1, width - 4);
	const panel = (text: string) => theme.bg("customMessageBg", text);
	const edge = (text: string) => panel(theme.fg("borderAccent", text));
	const bar = (count: number) => "─".repeat(Math.max(0, count));
	return {
		innerWidth,
		top(title, tail = "") {
			const label = title ? ` ${title} ` : "";
			const end = tail ? ` ${tail} ` : "";
			const fill = width - 3 - visibleWidth(label) - visibleWidth(end);
			const line = edge("╭─") + panel(theme.fg("accent", theme.bold(label))) + edge(bar(fill)) + panel(theme.fg("dim", end)) + edge("╮");
			return visibleWidth(line) > width ? truncateToWidth(line, width) : line;
		},
		row(content, background = panel) {
			return edge("│ ") + background(fit(content, innerWidth)) + edge(" │");
		},
		rule() {
			return edge(`├${bar(width - 2)}┤`);
		},
		bottom() {
			return edge(`╰${bar(width - 2)}╯`);
		},
	};
}
