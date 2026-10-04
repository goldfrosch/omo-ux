import { type ExtensionContext, getMarkdownTheme, type Theme } from "@code-yeongyu/senpi";
import {
	type Component,
	isKeyRelease,
	Markdown,
	matchesKey,
	type TUI,
	type TuiMouseEvent,
	type TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import { prewrapMarkdown } from "./markdown-wrap.ts";
import { holdOverlay, overlayOpen } from "./overlay.ts";
import { solidLine } from "./paint.ts";
import { READER_KEY } from "./profile.ts";
import type { QuestionItem } from "./question-input.ts";
import { latestReplyText } from "./transcript.ts";
import { joinEnds } from "./ui.ts";
import { wrapWords } from "./wrap.ts";

export interface ReaderContent {
	readonly blocks: readonly string[];
	readonly questions: readonly QuestionItem[];
}

export interface RenderedBlocks {
	readonly lines: readonly string[];
	readonly lastBlockStart: number;
}

interface ViewDeps {
	readonly tui: TUI;
	readonly theme: Theme;
	readonly done: () => void;
}

const CLOSE_KEYS = ["enter", "escape", "ctrl+c", READER_KEY] as const;
const HINTS = "↑↓ PgUp PgDn scroll · g/G top/end · enter/esc close";
const HINTS_ASKING = "↑↓ PgUp PgDn scroll · g/G top/end · enter answer";
const OPTION_INDENT = "     ";
const TEXT_BG = "customMessageBg";
const BAR_BG = "userMessageBg";

export function openReader(ctx: ExtensionContext, content: ReaderContent): Promise<void> {
	return holdOverlay(() =>
		ctx.ui.custom<void>((tui, theme, _keybindings, done) => new ReaderView(content, { tui, theme, done }), {
			overlay: true,
			overlayOptions: { anchor: "top-left", width: "100%", maxHeight: "100%" },
		}),
	);
}

export async function readLatest(ctx: ExtensionContext, questions: readonly QuestionItem[]): Promise<void> {
	const blocks = latestReplyText(ctx.sessionManager.getBranch());
	if (blocks.length === 0 && questions.length === 0) {
		ctx.ui.notify("omo-ux: nothing to read yet", "info");
		return;
	}
	await openReader(ctx, { blocks, questions });
}

/** A raw input listener, so the key also works while senpi's question window has focus. */
export function installReaderKey(ctx: ExtensionContext, pending: () => readonly QuestionItem[]): () => void {
	return ctx.ui.onTerminalInput((data) => {
		if (overlayOpen() || !matchesKey(data, READER_KEY) || isKeyRelease(data)) return undefined;
		readLatest(ctx, pending()).catch((error: unknown) => {
			ctx.ui.notify(`omo-ux: reader failed (${error instanceof Error ? error.message : String(error)})`, "warning");
		});
		return { consume: true };
	});
}

export function renderBlocks(blocks: readonly string[], width: number): RenderedBlocks {
	const lines: string[] = [];
	let lastBlockStart = 0;
	blocks.forEach((block, index) => {
		if (index > 0) lines.push("");
		lastBlockStart = lines.length;
		lines.push(...new Markdown(block, 0, 0, getMarkdownTheme(), undefined, { transform: prewrapMarkdown }).render(width));
	});
	return { lines, lastBlockStart };
}

export function measureBlocks(blocks: readonly string[], width: number): number {
	return renderBlocks(blocks, width).lines.length;
}

class ReaderView implements Component {
	private readonly content: ReaderContent;
	private readonly deps: ViewDeps;
	private body: RenderedBlocks | undefined;
	private bodyWidth = 0;
	private offset: number | undefined;
	private viewport = 1;

	constructor(content: ReaderContent, deps: ViewDeps) {
		this.content = content;
		this.deps = deps;
	}

	handleInput(data: string): void {
		if (data === "q" || CLOSE_KEYS.some((key) => matchesKey(data, key))) {
			this.deps.done();
			return;
		}
		const step = this.scrollStep(data);
		if (step !== undefined) this.scrollBy(step);
	}

	handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
		if (event.type !== "wheel" || event.wheelDelta === undefined) return undefined;
		this.scrollBy(event.wheelDelta);
		return { handled: true };
	}

	render(width: number): string[] {
		const { theme, tui } = this.deps;
		const textWidth = Math.max(10, width - 2);
		if (this.body === undefined || this.bodyWidth !== textWidth) {
			this.body = layoutBody(this.content, textWidth, theme);
			this.bodyWidth = textWidth;
		}
		const { lines, lastBlockStart } = this.body;
		const asking = this.content.questions.length > 0;
		this.viewport = Math.max(3, tui.terminal.rows - (asking ? 3 : 2));
		const lastOffset = Math.max(0, lines.length - this.viewport);
		// Open on the last screenful, but never in the middle of the newest block.
		this.offset = Math.min(lastOffset, this.offset ?? Math.min(lastBlockStart, lastOffset));
		const title = theme.fg("accent", theme.bold(asking ? " Read before answering" : " Last reply"));
		const screen = [solidLine(theme, BAR_BG, joinEnds(title, theme.fg("dim", `${this.position(lines.length)} `), width), width)];
		for (let row = 0; row < this.viewport; row++) {
			screen.push(solidLine(theme, TEXT_BG, ` ${lines[this.offset + row] ?? ""}`, width));
		}
		if (asking) screen.push(solidLine(theme, BAR_BG, theme.fg("text", ` ? ${summarize(this.content.questions)}`), width));
		screen.push(solidLine(theme, BAR_BG, theme.fg("dim", ` ${asking ? HINTS_ASKING : HINTS}`), width));
		return screen;
	}

	invalidate(): void {
		this.body = undefined;
	}

	private position(total: number): string {
		if (total <= this.viewport) return `${total} lines`;
		const first = (this.offset ?? 0) + 1;
		return `${first}-${Math.min(total, first + this.viewport - 1)} / ${total}`;
	}

	private scrollStep(data: string): number | undefined {
		const page = Math.max(1, this.viewport - 1);
		if (matchesKey(data, "up") || data === "k") return -1;
		if (matchesKey(data, "down") || data === "j") return 1;
		if (matchesKey(data, "pageUp") || data === "b") return -page;
		if (matchesKey(data, "pageDown") || matchesKey(data, "space") || data === "f") return page;
		if (matchesKey(data, "home") || data === "g") return Number.NEGATIVE_INFINITY;
		if (matchesKey(data, "end") || data === "G") return Number.POSITIVE_INFINITY;
		return undefined;
	}

	private scrollBy(step: number): void {
		const total = this.body?.lines.length ?? 0;
		this.offset = Math.min(Math.max(0, total - this.viewport), Math.max(0, (this.offset ?? 0) + step));
		this.deps.tui.requestRender();
	}
}

function layoutBody(content: ReaderContent, width: number, theme: Theme): RenderedBlocks {
	const rendered = renderBlocks(content.blocks, width);
	if (content.questions.length === 0) return rendered;
	return { lines: [...rendered.lines, ...questionLines(content.questions, width, theme)], lastBlockStart: rendered.lastBlockStart };
}

function questionLines(questions: readonly QuestionItem[], width: number, theme: Theme): string[] {
	const lines = ["", theme.fg("dim", "─".repeat(width))];
	for (const question of questions) {
		const kind = question.multiSelect ? theme.fg("dim", "  (choose any)") : "";
		lines.push(theme.fg("accent", theme.bold(`? ${question.header}`)) + kind);
		lines.push(...wrapWords(question.question, width).map((line) => theme.fg("text", line)));
		question.options.forEach((option, index) => {
			const number = `${index + 1}. `;
			wrapWords(option.label, width - 2 - number.length).forEach((line, row) => {
				lines.push(`  ${row === 0 ? number : " ".repeat(number.length)}${theme.fg("text", line)}`);
			});
			if (option.description === undefined) return;
			const described = wrapWords(option.description, width - OPTION_INDENT.length);
			lines.push(...described.map((line) => theme.fg("muted", `${OPTION_INDENT}${line}`)));
		});
		lines.push("");
	}
	return lines;
}

function summarize(questions: readonly QuestionItem[]): string {
	const headers = questions
		.map((question) => question.header)
		.filter((header) => header !== "")
		.join(", ");
	const first = questions[0]?.question.split("\n")[0] ?? "";
	return headers === "" ? first : `${headers}: ${first}`;
}
