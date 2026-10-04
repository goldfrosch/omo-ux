import type { ExtensionContext, Theme } from "@code-yeongyu/senpi";
import {
	type Component,
	type Focusable,
	matchesKey,
	type TUI,
	type TuiMouseEvent,
	type TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import type { QuestionRequest, QuestionResponse } from "./ask-schema.ts";
import { divider, hintBar, scrollTop, titleBar } from "./decision-chrome.ts";
import { BASE_BG, questionArea } from "./decision-layout.ts";
import { DecisionState, type Ending } from "./decision-state.ts";
import { holdOverlay } from "./overlay.ts";
import { solidLine } from "./paint.ts";
import { type RenderedBlocks, renderBlocks } from "./reader.ts";

export interface DecisionInput {
	readonly request: QuestionRequest;
	readonly blocks: readonly string[];
	readonly bell: boolean;
}

interface ViewDeps {
	readonly tui: TUI;
	readonly theme: Theme;
	readonly signal: AbortSignal | undefined;
	readonly done: (response: QuestionResponse) => void;
}

const QUESTION_SHARE = 0.55;
/** Enter, digits and space do nothing this long after opening, so a keystroke meant for the editor cannot answer. */
const INPUT_GRACE_MS = 400;
const CLOCK_TICK_MS = 30_000;

/** The explanation and the question on one opaque full-screen overlay; resolves with the user's answers. */
export function showDecision(
	ctx: ExtensionContext,
	input: DecisionInput,
	signal: AbortSignal | undefined,
): Promise<QuestionResponse> {
	return holdOverlay(() =>
		ctx.ui.custom<QuestionResponse>(
			(tui, theme, _keybindings, done) => {
				if (input.bell) tui.terminal.write("\x07");
				return new DecisionView(input, { tui, theme, signal, done });
			},
			{ overlay: true, overlayOptions: { anchor: "top-left", width: "100%", maxHeight: "100%" } },
		),
	);
}

class DecisionView implements Component, Focusable {
	private readonly source: DecisionInput;
	private readonly deps: ViewDeps;
	private readonly state: DecisionState;
	private readonly openedAt = Date.now();
	private readonly abort = () => this.end("cancelled");
	private readonly stopClock: () => void;
	private settled = false;
	private hasFocus = false;
	private text: { readonly width: number; readonly blocks: RenderedBlocks } | undefined;
	private textOffset: number | undefined;
	private textRows = 1;

	constructor(source: DecisionInput, deps: ViewDeps) {
		this.source = source;
		this.deps = deps;
		this.state = new DecisionState(source.request.questions);
		const timeout = setTimeout(() => this.end("timed_out"), source.request.timeoutMs);
		const tick = setInterval(() => deps.tui.requestRender(), CLOCK_TICK_MS);
		deps.signal?.addEventListener("abort", this.abort, { once: true });
		this.stopClock = () => {
			clearTimeout(timeout);
			clearInterval(tick);
			deps.signal?.removeEventListener("abort", this.abort);
		};
	}

	// The embedded Input needs focus propagated so the IME candidate window lands on the cursor.
	get focused(): boolean {
		return this.hasFocus;
	}

	set focused(value: boolean) {
		this.hasFocus = value;
		this.state.setFocus(value);
	}

	handleInput(data: string): void {
		const used = this.state.handleKey(data, Date.now() - this.openedAt >= INPUT_GRACE_MS);
		if (!used) this.scrollKey(data);
		if (this.state.ending !== undefined) this.end(this.state.ending);
		this.deps.tui.requestRender();
	}

	handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
		if (event.type !== "wheel" || event.wheelDelta === undefined) return undefined;
		this.scrollText(event.wheelDelta);
		this.deps.tui.requestRender();
		return { handled: true };
	}

	render(width: number): string[] {
		const { theme, tui } = this.deps;
		const { state } = this;
		const inner = Math.max(10, width - 2);
		const rows = Math.max(8, tui.terminal.rows);
		const question = state.question();
		const inputLine = state.typing ? (state.input.render(inner - 2)[0] ?? "") : undefined;
		const area = questionArea(question, state.choice(), inner, theme, inputLine);
		const text = this.textFor(inner);
		const withText = text.lines.length > 0;
		const free = rows - (withText ? 3 : 2);
		const questionRows = Math.min(area.rows.length, withText ? Math.max(4, Math.floor(free * QUESTION_SHARE)) : free);
		this.textRows = free - questionRows;
		const lastOffset = Math.max(0, text.lines.length - this.textRows);
		// Open on the last screenful, but never in the middle of the newest block.
		const offset = Math.min(lastOffset, this.textOffset ?? Math.min(text.lastBlockStart, lastOffset));
		this.textOffset = offset;
		const minutesLeft = Math.max(0, Math.ceil((this.openedAt + this.source.request.timeoutMs - Date.now()) / 60_000));
		const title = { header: question.header, step: state.index + 1, count: state.count, minutesLeft };
		const screen = [titleBar(theme, title, width)];
		if (withText) {
			for (let row = 0; row < this.textRows; row++) {
				screen.push(solidLine(theme, BASE_BG, ` ${text.lines[offset + row] ?? ""}`, width));
			}
			screen.push(divider(theme, offset, Math.max(0, text.lines.length - offset - this.textRows), width));
		}
		const top = scrollTop(area.focusStart, area.focusEnd, questionRows, area.rows.length);
		for (const row of area.rows.slice(top, top + questionRows)) screen.push(solidLine(theme, row.background, ` ${row.text}`, width));
		while (screen.length < rows - 1) screen.push(solidLine(theme, BASE_BG, "", width));
		const mode = state.dismissArmed ? "dismiss" : state.typing ? "typing" : "choosing";
		screen.push(hintBar(theme, { mode, question, multipleQuestions: state.count > 1 }, width));
		return screen;
	}

	invalidate(): void {
		this.text = undefined;
		this.state.input.invalidate();
	}

	dispose(): void {
		this.stopClock();
	}

	private textFor(width: number): RenderedBlocks {
		if (this.text?.width !== width) this.text = { width, blocks: renderBlocks(this.source.blocks, width) };
		return this.text.blocks;
	}

	private scrollKey(data: string): void {
		const page = Math.max(1, this.textRows - 1);
		if (matchesKey(data, "pageUp")) this.scrollText(-page);
		else if (matchesKey(data, "pageDown")) this.scrollText(page);
		else if (matchesKey(data, "home")) this.scrollText(Number.NEGATIVE_INFINITY);
		else if (matchesKey(data, "end")) this.scrollText(Number.POSITIVE_INFINITY);
	}

	private scrollText(step: number): void {
		const total = this.text?.blocks.lines.length ?? 0;
		this.textOffset = Math.min(Math.max(0, total - this.textRows), Math.max(0, (this.textOffset ?? 0) + step));
	}

	private end(ending: Ending): void {
		if (this.settled) return;
		this.settled = true;
		this.stopClock();
		const answers = { ...this.state.answers };
		const unanswered = this.source.request.questions.map((question) => question.id).filter((id) => answers[id] === undefined);
		switch (ending) {
			case "answered":
				this.deps.done({ status: ending, resolvedBy: "local_ui", answers, unanswered });
				return;
			case "timed_out":
				this.deps.done({ status: ending, answers, unanswered, autoResolvedAfterMs: this.source.request.timeoutMs });
				return;
			case "cancelled":
				this.deps.done({ status: ending, answers, unanswered });
				return;
		}
	}
}
