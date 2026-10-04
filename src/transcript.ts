import type { SessionEntry } from "@code-yeongyu/senpi";
import type { TextContent } from "@earendil-works/pi-ai";

const ASK_TOOLS: readonly string[] = ["ask_user_question", "request_user_input"];

interface Turn {
	readonly texts: readonly string[];
	readonly startedAfter: number | undefined;
}

/**
 * Assistant text, oldest first, written since the user last wrote or answered a question: an answered
 * question means the text before it was already read.
 */
export function currentTurnText(entries: readonly SessionEntry[]): readonly string[] {
	return scanTurn(entries, entries.length - 1).texts;
}

/** The current turn's text, or the previous turn's while the agent has written nothing new yet. */
export function latestReplyText(entries: readonly SessionEntry[]): readonly string[] {
	const current = scanTurn(entries, entries.length - 1);
	if (current.texts.length > 0 || current.startedAfter === undefined) return current.texts;
	return scanTurn(entries, current.startedAfter - 1).texts;
}

function scanTurn(entries: readonly SessionEntry[], from: number): Turn {
	const texts: string[] = [];
	for (let index = from; index >= 0; index--) {
		const entry = entries[index];
		if (entry?.type !== "message") continue;
		const message = entry.message;
		if (message.role === "user") return { texts, startedAfter: index };
		if (message.role === "toolResult" && ASK_TOOLS.includes(message.toolName)) return { texts, startedAfter: index };
		if (message.role !== "assistant") continue;
		const visible = message.content.filter(
			(part): part is TextContent => part.type === "text" && part.audience !== "model",
		);
		texts.unshift(...visible.map((part) => part.text.trim()).filter((text) => text !== ""));
	}
	return { texts, startedAfter: undefined };
}
