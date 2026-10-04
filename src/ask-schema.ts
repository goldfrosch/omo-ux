import type { ExtensionUIContext } from "@code-yeongyu/senpi";
import { Type } from "typebox";

type QuestionUi = NonNullable<ExtensionUIContext["question"]>;
export type QuestionRequest = Parameters<QuestionUi>[0];
export type QuestionResponse = Awaited<ReturnType<QuestionUi>>;
export type AskQuestion = QuestionRequest["questions"][number];
export type AskVariant = "claude" | "codex";

/**
 * Names, arguments, descriptions and validation copied from senpi's built-in ask-user tool (2026.10.5), so
 * models and prompts see no difference when omo-ux stands in for it.
 */
export const ASK_TOOL_NAMES = { claude: "ask_user_question", codex: "request_user_input" } as const;

const CODEX_OPTION = Type.Object(
	{
		label: Type.String({ description: "User-facing label (1-5 words)." }),
		description: Type.String({ description: "One short sentence explaining impact/tradeoff if selected." }),
	},
	{ additionalProperties: false },
);

export const CODEX_PARAMS = Type.Object(
	{
		questions: Type.Array(
			Type.Object(
				{
					id: Type.String({
						pattern: "^[a-z][a-z0-9]*(_[a-z0-9]+)*$",
						description: "Stable identifier for mapping answers (snake_case).",
					}),
					header: Type.String({
						minLength: 1,
						maxLength: 12,
						description: "Short header label shown in the UI (12 or fewer chars).",
					}),
					question: Type.String({ minLength: 1, description: "Single-sentence prompt shown to the user." }),
					options: Type.Array(CODEX_OPTION, {
						minItems: 2,
						maxItems: 3,
						description:
							'Provide 2-3 mutually exclusive choices. Put the recommended option first and suffix its label with "(Recommended)". Do not include an "Other" option in this list; the client will add a free-form "Other" option automatically.',
					}),
					multiSelect: Type.Optional(
						Type.Boolean({
							description: "Set to true to allow the user to select multiple options instead of just one.",
						}),
					),
				},
				{ additionalProperties: false },
			),
			{ minItems: 1, maxItems: 3, description: "Questions to show the user. Prefer 1 and do not exceed 3" },
		),
		wait_for_answer: Type.Boolean({
			description:
				"Set true to pause here until the user answers; set false to keep working and receive the answer later as a user message.",
		}),
	},
	{ additionalProperties: false },
);

const CLAUDE_OPTION = Type.Object({
	label: Type.String({
		description:
			"The display text for this option that the user will see and select. Should be concise (1-5 words) and clearly describe the choice.",
	}),
	description: Type.Optional(
		Type.String({
			description:
				"Explanation of what this option means or what will happen if chosen. Useful for providing context about trade-offs or implications.",
		}),
	),
});

export const CLAUDE_PARAMS = Type.Object({
	questions: Type.Array(
		Type.Object({
			question: Type.String({
				minLength: 1,
				description:
					'The complete question to ask the user. Should be clear, specific, and end with a question mark. Example: "Which library should we use for date formatting?" If multiSelect is true, phrase it accordingly, e.g. "Which features do you want to enable?"',
			}),
			header: Type.String({
				minLength: 1,
				maxLength: 12,
				description:
					'Very short label displayed as a chip/tag (max 12 chars). Examples: "Auth method", "Library", "Approach".',
			}),
			options: Type.Optional(
				Type.Array(CLAUDE_OPTION, {
					minItems: 2,
					maxItems: 4,
					description:
						"The available choices for this question. Must have 2-4 options. Each option should be a distinct, mutually exclusive choice (unless multiSelect is enabled). There should be no Other option, that will be provided automatically.",
				}),
			),
			multiSelect: Type.Boolean({
				description:
					"Set to true to allow the user to select multiple options instead of just one. Use when choices are not mutually exclusive.",
			}),
		}),
		{ minItems: 1, maxItems: 4, description: "Questions to ask the user (1-4 questions)" },
	),
	waitForAnswer: Type.Boolean({
		description:
			"Set true to pause here until the user answers; set false to keep working and receive the answer later as a user message.",
	}),
});

export class AskSchemaError extends Error {
	override readonly name = "AskSchemaError";
}

const WAIT_FLAG_STEER =
	"This call omitted wait_for_answer (or waitForAnswer). Set true to pause here until the user answers, false to keep working and receive the answer later as a user message.";
const HEADER_MAX = 12;
const SNAKE_CASE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
const LIMITS = {
	codex: { maxQuestions: 3, minOptions: 2, maxOptions: 3, optionsRequired: true },
	claude: { maxQuestions: 4, minOptions: 2, maxOptions: 4, optionsRequired: false },
} as const;
const GPT_ID = /(?:^|[/@:._-])gpt(?:[._-]|\d)/i;
const CODEX_APIS: readonly string[] = ["openai-responses", "azure-openai-responses", "openai-codex-responses", "openai-completions"];

/** senpi offers the codex variant to GPT models on OpenAI-style APIs and the claude variant to everything else. */
export function askVariantFor(model: { readonly id: string; readonly api: string } | undefined): AskVariant {
	return model !== undefined && GPT_ID.test(model.id) && CODEX_APIS.includes(model.api) ? "codex" : "claude";
}

/** Validates the tool arguments into a request; omo-ux always waits for the answer, whatever the flag says. */
export function toRequest(variant: AskVariant, args: unknown, requestId: string, timeoutMs: number): QuestionRequest {
	if (!isRecord(args)) throw new AskSchemaError(WAIT_FLAG_STEER);
	if (typeof args[variant === "codex" ? "wait_for_answer" : "waitForAnswer"] !== "boolean") {
		throw new AskSchemaError(WAIT_FLAG_STEER);
	}
	const { maxQuestions } = LIMITS[variant];
	const list = args.questions;
	if (!Array.isArray(list) || list.length < 1 || list.length > maxQuestions) {
		throw new AskSchemaError(`questions must contain 1 to ${maxQuestions} items`);
	}
	return {
		requestId,
		questions: list.map((raw: unknown, index) => toQuestion(variant, raw, index)),
		waitForAnswer: true,
		timeoutMs,
	};
}

function toQuestion(variant: AskVariant, raw: unknown, index: number): AskQuestion {
	if (!isRecord(raw)) throw new AskSchemaError("each question must be an object");
	const header = typeof raw.header === "string" ? raw.header.trim() : "";
	if (header.length === 0) throw new AskSchemaError("header must be non-empty");
	if (header.length > HEADER_MAX) throw new AskSchemaError("header must be 12 or fewer characters");
	const question = typeof raw.question === "string" ? raw.question.trim() : "";
	if (question.length === 0) throw new AskSchemaError("question must be non-empty");
	const options = toOptions(variant, raw.options);
	if (variant === "claude") {
		if (typeof raw.multiSelect !== "boolean") throw new AskSchemaError("multiSelect is required");
		return { id: `q${index + 1}`, header, question, options, multiSelect: raw.multiSelect };
	}
	const id = typeof raw.id === "string" ? raw.id.trim() : "";
	if (!SNAKE_CASE.test(id)) throw new AskSchemaError("id must be snake_case");
	return { id, header, question, options, multiSelect: raw.multiSelect === true };
}

function toOptions(variant: AskVariant, raw: unknown): AskQuestion["options"] {
	const { minOptions, maxOptions, optionsRequired } = LIMITS[variant];
	if (raw === undefined) {
		if (optionsRequired) throw new AskSchemaError(`options must contain ${minOptions} to ${maxOptions} items`);
		return [];
	}
	if (!Array.isArray(raw)) throw new AskSchemaError("options must be an array");
	if (raw.length < minOptions || raw.length > maxOptions) {
		const when = optionsRequired ? "" : " when present";
		throw new AskSchemaError(`options must contain ${minOptions} to ${maxOptions} items${when}`);
	}
	return raw.map((item: unknown) => {
		if (!isRecord(item)) throw new AskSchemaError("each option must be an object");
		const label = typeof item.label === "string" ? item.label.trim() : "";
		if (label.length === 0) throw new AskSchemaError("option label must be non-empty");
		const description = typeof item.description === "string" ? item.description.trim() : "";
		if (variant === "codex" && description.length === 0) throw new AskSchemaError("option description is required");
		return description.length === 0 ? { label } : { label, description };
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
