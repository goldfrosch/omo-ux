import type { Theme } from "@code-yeongyu/senpi";
import { type Component, Text } from "@earendil-works/pi-tui";
import type { AskQuestion, AskVariant, QuestionResponse } from "./ask-schema.ts";

type Answer = QuestionResponse["answers"][string];
export type AskDetails = Record<string, unknown>;

const DEFAULT_TIMEOUT_MS = 30 * 60_000;

/** The text senpi's built-in tool returns to the model for each outcome (2026.10.5), kept word for word. */
export function resultText(response: QuestionResponse, questions: readonly AskQuestion[]): string {
	switch (response.status) {
		case "answered":
			return [...answeredLines(response, questions), ...unansweredLine(response, questions)].join("\n");
		case "comment-submitted":
			return [
				`The user responded: ${response.comment?.trim() ?? ""}`,
				...answeredLines(response, questions),
				...unansweredLine(response, questions),
			].join("\n");
		case "timed_out": {
			const minutes = Math.round((response.autoResolvedAfterMs ?? DEFAULT_TIMEOUT_MS) / 60_000);
			const selected = answeredLines(response, questions);
			return [
				`The user did not answer within ${minutes} minutes. (사용자가 답변을 안하고 timeout 으로 종료됨)`,
				...(selected.length > 0 ? [`Before going idle the user had selected: ${selected.join("; ")}`] : []),
				"Continue the work to completion on your best judgment; do not ask this question again this turn.",
			].join("\n");
		}
		case "cancelled":
			return "The user dismissed the question.";
		case "orphaned-after-restart":
			return "The pending question could not be resumed after a restart; continue on best judgment.";
		case "unavailable":
			return "This session has no user attached (subagent or headless); decide on best judgment.";
	}
}

/** The details senpi's built-in tool attaches, so its result renderer and any reader of the session agree. */
export function resultDetails(variant: AskVariant, response: QuestionResponse, questions: readonly AskQuestion[]): AskDetails {
	const resolvedBy = response.resolvedBy === undefined ? {} : { resolvedBy: response.resolvedBy };
	if (variant === "codex") {
		const answers = Object.fromEntries(
			Object.entries(response.answers).map(([id, answer]) => [id, { answers: selectedAnswers(answer) }]),
		);
		const comment = response.comment === undefined ? {} : { comment: response.comment };
		return { ...resolvedBy, answers, unanswered: response.unanswered, status: response.status, ...comment };
	}
	const textFor = (id: string) => questions.find((question) => question.id === id)?.question ?? id;
	const answers: Record<string, string> = {};
	for (const [id, answer] of Object.entries(response.answers)) {
		const body = answerBody(answer);
		if (body !== undefined) answers[textFor(id)] = body;
	}
	const freeText = response.comment === undefined ? {} : { freeText: response.comment };
	return {
		...resolvedBy,
		questions,
		answers,
		unanswered: response.unanswered.map(textFor),
		status: response.status,
		...freeText,
	};
}

export function renderAskCall(args: unknown, theme: Theme): Component {
	const questions = isRecord(args) && Array.isArray(args.questions) ? args.questions : undefined;
	const headers = questions
		? questions.map((question: unknown) => (isRecord(question) ? `[${String(question.header)}]` : "[Question]")).join(" ")
		: "Question";
	return new Text(`${theme.fg("toolTitle", headers)} wait for answer`, 0, 0);
}

export function renderAskResult(result: { readonly content: readonly { type: string; text?: string }[]; readonly details?: unknown }): Component {
	const details = isRecord(result.details) ? result.details : {};
	let summary = typeof details.status === "string" ? details.status : "";
	if (summary !== "" && isRecord(details.answers)) summary += `; ${Object.keys(details.answers).length} answered`;
	if (summary !== "" && Array.isArray(details.unanswered)) summary += `; ${details.unanswered.length} unanswered`;
	const texts = result.content.flatMap((part) => (part.type === "text" && part.text ? [part.text] : []));
	return new Text([summary, ...texts].filter(Boolean).join("\n"), 0, 0);
}

function answerBody(answer: Answer | undefined): string | undefined {
	if (!answer) return undefined;
	if (answer.selected.length > 0) return answer.selected.join(", ");
	const text = answer.text?.trim();
	return text === undefined || text.length === 0 ? undefined : text;
}

function selectedAnswers(answer: Answer): string[] {
	const text = answer.text?.trim();
	return text ? [...answer.selected, text] : [...answer.selected];
}

function answeredLines(response: QuestionResponse, questions: readonly AskQuestion[]): string[] {
	const lines: string[] = [];
	const seen = new Set<string>();
	for (const question of questions) {
		const body = answerBody(response.answers[question.id]);
		if (body === undefined) continue;
		lines.push(`${question.header}: ${body}`);
		seen.add(question.id);
	}
	for (const [id, answer] of Object.entries(response.answers)) {
		const body = seen.has(id) ? undefined : answerBody(answer);
		if (body !== undefined) lines.push(`${questions.find((question) => question.id === id)?.header ?? id}: ${body}`);
	}
	return lines;
}

function unansweredLine(response: QuestionResponse, questions: readonly AskQuestion[]): string[] {
	if (response.unanswered.length === 0) return [];
	const headers = response.unanswered.map((id) => questions.find((question) => question.id === id)?.header ?? id);
	return [`Unanswered: ${headers.join(", ")}`];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
