import type { Theme } from "@code-yeongyu/senpi";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { AskQuestion } from "./ask-schema.ts";
import { BASE_BG } from "./decision-layout.ts";
import { solidLine } from "./paint.ts";
import { joinEnds } from "./ui.ts";

const BAR_BG = "userMessageBg";

export interface TitleInfo {
	readonly header: string;
	readonly step: number;
	readonly count: number;
	readonly minutesLeft: number;
}

export type HintMode = "dismiss" | "typing" | "choosing";

export interface HintInfo {
	readonly mode: HintMode;
	readonly question: AskQuestion;
	readonly multipleQuestions: boolean;
}

export function titleBar(theme: Theme, info: TitleInfo, width: number): string {
	const step = info.count > 1 ? theme.fg("dim", ` · ${info.step}/${info.count}`) : "";
	const left = theme.fg("accent", theme.bold(` ? ${info.header}`)) + step;
	return solidLine(theme, BAR_BG, joinEnds(left, theme.fg("dim", `${info.minutesLeft}m left `), width), width);
}

export function divider(theme: Theme, above: number, below: number, width: number): string {
	const info = [above > 0 ? `↑${above}` : "", below > 0 ? `↓${below}` : ""].filter(Boolean).join(" ");
	const label = info === "" ? "" : ` ${info} · pgup/pgdn `;
	const rule = "─".repeat(Math.max(0, width - visibleWidth(label) - 2));
	return solidLine(theme, BASE_BG, theme.fg("dim", ` ${rule}${label}`), width);
}

export function hintBar(theme: Theme, info: HintInfo, width: number): string {
	return solidLine(theme, BAR_BG, ` ${hintText(theme, info)}`, width);
}

function hintText(theme: Theme, { mode, question, multipleQuestions }: HintInfo): string {
	switch (mode) {
		case "dismiss":
			return theme.fg("warning", "press esc again to dismiss the question");
		case "typing": {
			const back = question.options.length > 0 ? "esc back to options" : "esc dismiss";
			return theme.fg("dim", `type your answer · enter send · ${back}`);
		}
		case "choosing": {
			const pick = question.multiSelect ? "space pick · enter confirm" : `enter or 1-${question.options.length + 1} answer`;
			const steps = multipleQuestions ? " · tab next question" : "";
			// Scrolling keys are shown on the divider, and only while there is more text to scroll.
			return theme.fg("dim", `↑↓ move · ${pick}${steps} · esc dismiss`);
		}
	}
}

/** First visible row of the question area: the highlighted option stays on screen, its start winning if it is taller. */
export function scrollTop(focusStart: number, focusEnd: number, height: number, total: number): number {
	if (total <= height) return 0;
	return Math.min(Math.max(0, focusEnd - height), focusStart, total - height);
}
