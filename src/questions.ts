import type { ExtensionAPI } from "@code-yeongyu/senpi";

/**
 * senpi's ask-user tool in both wire variants, with the argument that makes a call block. An async call
 * (flag false) only shows a widget above the editor, so whatever the user types there is sent back as a
 * free-text comment and the options go unused. A blocking call opens the selectable question overlay.
 */
const WAIT_FLAG: Readonly<Record<string, string>> = {
	ask_user_question: "waitForAnswer",
	request_user_input: "wait_for_answer",
};

/** In the interactive TUI every AI question opens the option overlay, and the turn waits for the answer. */
export function registerBlockingQuestions(pi: ExtensionAPI): void {
	pi.on("tool_call", (event, ctx) => {
		const flag = WAIT_FLAG[event.toolName];
		if (flag === undefined || ctx.mode !== "tui") return;
		// senpi documents in-place mutation of event.input as the way to patch tool arguments.
		(event.input as Record<string, unknown>)[flag] = true;
	});
}
