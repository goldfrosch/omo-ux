import { wrapWords } from "./wrap.ts";

export interface QuestionOption {
	readonly label: string;
	readonly description: string | undefined;
}

export interface QuestionItem {
	readonly header: string;
	readonly question: string;
	readonly options: readonly QuestionOption[];
	readonly multiSelect: boolean;
}

/**
 * Layout of senpi's question window, measured on 2026.10.5: text is padded one column on each side, option
 * descriptions are indented five more, and besides the question and options the window takes nine rows
 * (two borders, two spacers, title, tabs, own-answer row, submit line, key hints).
 */
const TEXT_PADDING = 2;
const DESCRIPTION_INDENT = "     ";
const WINDOW_CHROME_ROWS = 9;

export function readQuestions(input: Record<string, unknown>): QuestionItem[] {
	const list = input.questions;
	if (!Array.isArray(list)) return [];
	return list.filter(isRecord).flatMap((raw) => {
		if (typeof raw.question !== "string") return [];
		const options = Array.isArray(raw.options) ? raw.options.filter(isRecord).flatMap(readOption) : [];
		return [
			{
				header: typeof raw.header === "string" ? raw.header : "",
				question: raw.question,
				options,
				multiSelect: raw.multiSelect === true,
			},
		];
	});
}

/**
 * Re-breaks the question and option descriptions at spaces for the window's width, in the tool arguments
 * themselves (senpi documents mutating `event.input`). The window then never splits a Korean word, and a
 * wrapped description continues under its first line instead of at the window's edge.
 */
export function prewrapQuestionInput(input: Record<string, unknown>, columns: number): void {
	const list = input.questions;
	if (!Array.isArray(list)) return;
	const width = columns - TEXT_PADDING;
	for (const question of list.filter(isRecord)) {
		if (typeof question.question === "string") question.question = wrapWords(question.question, width).join("\n");
		if (!Array.isArray(question.options)) continue;
		for (const option of question.options.filter(isRecord)) {
			if (typeof option.description !== "string") continue;
			option.description = wrapWords(option.description, width - DESCRIPTION_INDENT.length).join(`\n${DESCRIPTION_INDENT}`);
		}
	}
}

export function questionWindowRows(questions: readonly QuestionItem[], columns: number): number {
	const width = columns - TEXT_PADDING;
	const rows = questions.map(
		(question) =>
			wrapWords(question.question, width).length +
			question.options.reduce(
				(sum, option) =>
					sum + 1 + (option.description ? wrapWords(option.description, width - DESCRIPTION_INDENT.length).length : 0),
				0,
			),
	);
	return WINDOW_CHROME_ROWS + Math.max(0, ...rows);
}

function readOption(raw: Record<string, unknown>): QuestionOption[] {
	if (typeof raw.label !== "string") return [];
	return [{ label: raw.label, description: typeof raw.description === "string" ? raw.description : undefined }];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
