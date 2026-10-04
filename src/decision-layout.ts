import type { Theme, ThemeBg } from "@code-yeongyu/senpi";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { AskQuestion } from "./ask-schema.ts";
import { wrapWords } from "./wrap.ts";

export interface Row {
	readonly text: string;
	readonly background: ThemeBg;
}

export interface Choice {
	/** Option index; `options.length` is the "type your own answer" row. */
	highlight: number;
	readonly picked: Set<string>;
	ownText: string | undefined;
}

export interface QuestionArea {
	readonly rows: readonly Row[];
	readonly focusStart: number;
	readonly focusEnd: number;
}

export const BASE_BG: ThemeBg = "customMessageBg";
const FOCUS_BG: ThemeBg = "selectedBg";
const OWN_ANSWER = "Type your own answer";

/**
 * The question, then one row per option with its description cut to that row. Only the highlighted option
 * opens up, with its full label and description on the focus background, so the area stays short and the
 * explanation above keeps most of the screen.
 */
export function questionArea(
	question: AskQuestion,
	choice: Choice,
	width: number,
	theme: Theme,
	inputLine: string | undefined,
): QuestionArea {
	const rows: Row[] = wrapWords(question.question, width).map((line) => ({
		text: theme.bold(theme.fg("text", line)),
		background: BASE_BG,
	}));
	const numberWidth = String(question.options.length + 1).length;
	let focusStart = rows.length;
	let focusEnd = rows.length;
	question.options.forEach((option, index) => {
		const box = question.multiSelect ? (choice.picked.has(option.label) ? "[x] " : "[ ] ") : "";
		const head = `${String(index + 1).padStart(numberWidth)} ${box}`;
		if (index !== choice.highlight) {
			rows.push(closedOption(option, head, width, theme));
			return;
		}
		focusStart = rows.length;
		rows.push(...openOption(option, head, width, theme));
		focusEnd = rows.length;
	});
	const ownIndex = question.options.length;
	const ownOpen = choice.highlight === ownIndex;
	if (ownOpen) focusStart = rows.length;
	const ownLabel = choice.ownText === undefined ? `${OWN_ANSWER}…` : `${OWN_ANSWER}: ${choice.ownText}`;
	const ownHead = `${String(ownIndex + 1).padStart(numberWidth)} `;
	rows.push({
		text: `${ownOpen ? theme.fg("accent", "▌") : " "} ${theme.fg(ownOpen ? "accent" : "dim", ownHead)}${theme.fg("muted", ownLabel)}`,
		background: ownOpen ? FOCUS_BG : BASE_BG,
	});
	if (inputLine !== undefined) rows.push({ text: `  ${inputLine}`, background: FOCUS_BG });
	if (ownOpen) focusEnd = rows.length;
	return { rows, focusStart, focusEnd };
}

function openOption(option: AskQuestion["options"][number], head: string, width: number, theme: Theme): Row[] {
	const marker = theme.fg("accent", "▌");
	const indent = " ".repeat(visibleWidth(head));
	const room = width - 2 - visibleWidth(head);
	const rows = wrapWords(option.label, room).map((line, row) => ({
		text: `${marker} ${row === 0 ? theme.fg("accent", head) : indent}${theme.bold(theme.fg("text", line))}`,
		background: FOCUS_BG,
	}));
	if (option.description) {
		const described = wrapWords(option.description, room);
		rows.push(...described.map((line) => ({ text: `${marker} ${indent}${theme.fg("text", line)}`, background: FOCUS_BG })));
	}
	return rows;
}

function closedOption(option: AskQuestion["options"][number], head: string, width: number, theme: Theme): Row {
	const label = `  ${theme.fg("dim", head)}${theme.fg("text", option.label)}`;
	const room = width - visibleWidth(label) - 2;
	const description =
		option.description && room > 8 ? `  ${theme.fg("muted", truncateToWidth(option.description.replace(/\s+/g, " "), room))}` : "";
	return { text: label + description, background: BASE_BG };
}
