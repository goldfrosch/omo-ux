import type { ExtensionAPI, ExtensionContext, ExtensionToolContext, ToolDefinition } from "@code-yeongyu/senpi";
import type { TSchema } from "typebox";
import { type AskDetails, renderAskCall, renderAskResult, resultDetails, resultText } from "./ask-format.ts";
import {
	ASK_TOOL_NAMES,
	AskSchemaError,
	type AskVariant,
	askVariantFor,
	CLAUDE_PARAMS,
	CODEX_PARAMS,
	type QuestionRequest,
	type QuestionResponse,
	toRequest,
} from "./ask-schema.ts";
import { showDecision } from "./decision-view.ts";
import { DISABLED_BUILTINS } from "./profile.ts";
import { currentTurnText } from "./transcript.ts";

const ALL_NAMES: readonly string[] = Object.values(ASK_TOOL_NAMES);
const DEFAULT_TIMEOUT_MINUTES = 30;
/** Registered by senpi's built-in ask-user extension, so it is defined exactly while that extension is loaded. */
const BUILTIN_FLAG = "no-ask-user";

export interface AskTools {
	/** Takes over the question tool when senpi's ask-user extension is not loaded; returns whether it did. */
	install(ctx: ExtensionContext): boolean;
	owns(): boolean;
}

export function createAskTools(pi: ExtensionAPI): AskTools {
	let registered = false;
	let owning = false;
	const activate = (model: ExtensionContext["model"]) => {
		const others = pi.getActiveTools().filter((name) => !ALL_NAMES.includes(name));
		pi.setActiveTools([...others, ASK_TOOL_NAMES[askVariantFor(model)]]);
	};
	pi.on("model_select", (event) => {
		if (owning) activate(event.model);
	});
	return {
		install(ctx) {
			owning = registered || builtinAbsent(pi);
			if (!owning) return false;
			if (!registered) {
				pi.registerTool(askTool("claude", CLAUDE_PARAMS, pi));
				pi.registerTool(askTool("codex", CODEX_PARAMS, pi));
				registered = true;
			}
			activate(ctx.model);
			return true;
		},
		owns: () => owning,
	};
}

function builtinAbsent(pi: ExtensionAPI): boolean {
	const disabled = pi.getSettings().disabledBuiltinExtensions ?? [];
	return (
		DISABLED_BUILTINS.every((id) => disabled.includes(id)) &&
		pi.getFlag(BUILTIN_FLAG) === undefined &&
		!pi.getAllTools().some((tool) => ALL_NAMES.includes(tool.name))
	);
}

function askTool<T extends TSchema>(variant: AskVariant, parameters: T, pi: ExtensionAPI): ToolDefinition<T, AskDetails> {
	const flag = variant === "codex" ? "wait_for_answer" : "waitForAnswer";
	const opener =
		variant === "codex"
			? "Request user input for one to three short questions."
			: "Ask the user one to four concise questions.";
	const other =
		variant === "claude"
			? " Users will always be able to type a free-text answer or one comment covering everything; do not add an Other option."
			: "";
	return {
		name: ASK_TOOL_NAMES[variant],
		label: "Ask user",
		exposure: "direct",
		allowLazyActivation: false,
		parameters,
		promptSnippet: "Ask a material question, explicitly choosing whether to wait or receive the answer later.",
		description: `${opener} Set ${flag} true to pause here until the user answers (the answer returns as this tool's result, or a timeout result after 30 idle minutes); set ${flag} false to keep working while the question stays open (the answer arrives later as a user message). Use it only when the answer materially changes the work; if it returns no answers, continue with best judgment instead of asking again. Never use it for permission requests; ask those directly in your message. Unavailable to subagents.${other} Call this tool directly, never from inside an eval cell (a cell that waits on the user would hold the kernel).`,
		async execute(toolCallId, params, signal, _onUpdate, ctx) {
			const minutes = ctx.getAskUserSettings?.().timeoutMinutes ?? DEFAULT_TIMEOUT_MINUTES;
			let request: QuestionRequest;
			try {
				request = toRequest(variant, params, toolCallId, minutes * 60_000);
			} catch (error) {
				if (!(error instanceof AskSchemaError)) throw error;
				return { content: [{ type: "text", text: error.message }], details: { status: "unavailable" } };
			}
			const response = await collect(ctx, request, signal, pi);
			return {
				content: [{ type: "text", text: resultText(response, request.questions) }],
				details: resultDetails(variant, response, request.questions),
			};
		},
		renderCall: (args, theme) => renderAskCall(args, theme),
		renderResult: (result) => renderAskResult(result),
	};
}

function collect(
	ctx: ExtensionToolContext,
	request: QuestionRequest,
	signal: AbortSignal | undefined,
	pi: ExtensionAPI,
): Promise<QuestionResponse> {
	if (ctx.mode === "tui") {
		const bell = pi.getSettings().askUser?.bell ?? true;
		return showDecision(ctx, { request, blocks: currentTurnText(ctx.sessionManager.getBranch()), bell }, signal);
	}
	if (ctx.hasUI && ctx.ui.question) return ctx.ui.question(request, { signal, timeout: request.timeoutMs });
	return Promise.resolve({ status: "unavailable", answers: {}, unanswered: request.questions.map((question) => question.id) });
}
