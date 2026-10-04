import type { ExtensionAPI } from "@code-yeongyu/senpi";

const READING_RULES = `## Reading surface (omo-ux)

The user reads replies in a small terminal pane (often about 105x24), and an open question window covers most of it.

When you ask the user to confirm or choose (ask_user_question or request_user_input):
- Put the decision and your recommendation first, in one or two lines, before any supporting detail.
- Make the question text self-contained: say what is being decided and what each choice changes, so it can be answered without scrolling back.
- Keep each option description to one short line (about 40 Korean or 80 Latin characters).

In every reply, prefer short paragraphs and lists over long blocks of prose.`;

/** Preview-safe (a pure append), so senpi's prompt-cache prewarm still runs with this extension loaded. */
export function registerReadingRules(pi: ExtensionAPI): void {
	pi.on(
		"before_agent_start",
		(event, ctx) => (ctx.mode === "tui" ? { systemPrompt: `${event.systemPrompt}\n\n${READING_RULES}` } : undefined),
		{ previewSafe: true },
	);
}
