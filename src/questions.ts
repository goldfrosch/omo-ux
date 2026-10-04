import type { ExtensionAPI, ExtensionContext } from "@code-yeongyu/senpi";
import { prewrapQuestionInput, type QuestionItem, questionWindowRows, readQuestions } from "./question-input.ts";
import { measureBlocks, openReader } from "./reader.ts";
import { currentTurnText } from "./transcript.ts";

/**
 * senpi's ask-user tool in both wire variants, with the argument that makes a call block. An async call
 * (flag false) only shows a widget above the editor, so whatever the user types there is sent back as a
 * free-text comment and the options go unused. A blocking call opens the selectable question overlay.
 */
const WAIT_FLAG: Readonly<Record<string, string>> = {
	ask_user_question: "waitForAnswer",
	request_user_input: "wait_for_answer",
};
/** Transcript rows lost besides the question window: the footer, the tool-call line and the spacing around it. */
const RESERVED_ROWS = 4;
const TRANSCRIPT_PADDING = 2;

export interface Viewport {
	readonly columns: number;
	readonly rows: number;
}

export interface QuestionFlow {
	pending(): readonly QuestionItem[];
}

/**
 * In the interactive TUI every AI question opens the option overlay, and the turn waits for the answer. When
 * the text written before the question would not fit above the overlay, the reader shows it first; then the
 * question text is re-broken at word boundaries for the overlay's width.
 */
export function registerQuestionFlow(pi: ExtensionAPI, viewport: () => Viewport, decisionScreen: () => boolean): QuestionFlow {
	let pending: { readonly id: string; readonly questions: readonly QuestionItem[] } | undefined;
	pi.on("tool_call", async (event, ctx) => {
		const flag = WAIT_FLAG[event.toolName];
		if (flag === undefined || ctx.mode !== "tui" || decisionScreen()) return;
		// senpi documents in-place mutation of event.input as the way to patch tool arguments.
		const input = event.input as Record<string, unknown>;
		input[flag] = true;
		const questions = readQuestions(input);
		pending = { id: event.toolCallId, questions };
		await readFirstIfHidden(ctx, questions, viewport());
		prewrapQuestionInput(input, viewport().columns);
	});
	pi.on("tool_result", (event) => {
		if (event.toolCallId === pending?.id) pending = undefined;
	});
	pi.on("session_shutdown", () => {
		pending = undefined;
	});
	return { pending: () => pending?.questions ?? [] };
}

async function readFirstIfHidden(
	ctx: ExtensionContext,
	questions: readonly QuestionItem[],
	{ columns, rows }: Viewport,
): Promise<void> {
	const blocks = currentTurnText(ctx.sessionManager.getBranch());
	if (blocks.length === 0) return;
	const room = rows - RESERVED_ROWS - questionWindowRows(questions, columns);
	if (measureBlocks(blocks, columns - TRANSCRIPT_PADDING) <= room) return;
	try {
		await openReader(ctx, { blocks, questions });
	} catch (error) {
		ctx.ui.notify(`omo-ux: reader failed (${error instanceof Error ? error.message : String(error)})`, "warning");
	}
}
