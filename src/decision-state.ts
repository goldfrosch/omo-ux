import { Input, matchesKey } from "@earendil-works/pi-tui";
import type { AskQuestion, QuestionResponse } from "./ask-schema.ts";
import type { Choice } from "./decision-layout.ts";

export type Ending = "answered" | "cancelled" | "timed_out";

/** Answers and keyboard rules of the decision screen; the view draws it and scrolls the explanation. */
export class DecisionState {
	readonly input = new Input({ prompt: "> " });
	readonly answers: QuestionResponse["answers"] = {};
	index = 0;
	typing = false;
	dismissArmed = false;
	ending: Ending | undefined;
	private readonly questions: readonly AskQuestion[];
	private readonly choices: Choice[];
	private hasFocus = false;

	constructor(questions: readonly AskQuestion[]) {
		this.questions = questions;
		this.choices = questions.map(() => ({ highlight: 0, picked: new Set<string>(), ownText: undefined }));
		if (this.question().options.length === 0) this.setTyping(true);
	}

	get count(): number {
		return this.questions.length;
	}

	question(): AskQuestion {
		const question = this.questions[this.index];
		if (!question) throw new Error(`omo-ux: question ${this.index} out of range`);
		return question;
	}

	choice(): Choice {
		const choice = this.choices[this.index];
		if (!choice) throw new Error(`omo-ux: choice ${this.index} out of range`);
		return choice;
	}

	setFocus(focused: boolean): void {
		this.hasFocus = focused;
		this.input.focused = focused && this.typing;
	}

	/** One key press; false for keys it does not use. `answering` is off while a just-opened screen ignores answers. */
	handleKey(data: string, answering: boolean): boolean {
		if (this.typing) {
			this.typeKey(data);
			return true;
		}
		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			this.escapeKey();
			return true;
		}
		this.dismissArmed = false;
		return this.moveKey(data) || (answering && this.answerKey(data));
	}

	private escapeKey(): void {
		if (this.dismissArmed) this.ending = "cancelled";
		else this.dismissArmed = true;
	}

	private typeKey(data: string): void {
		if (matchesKey(data, "escape")) {
			if (this.question().options.length > 0) this.setTyping(false);
			else this.escapeKey();
			return;
		}
		if (!matchesKey(data, "enter")) {
			this.input.handleInput(data);
			return;
		}
		const text = this.input.getValue().trim();
		if (text === "") return;
		this.choice().ownText = text;
		this.answers[this.question().id] = { selected: [], text };
		this.setTyping(false);
		this.next();
	}

	private moveKey(data: string): boolean {
		const choice = this.choice();
		const count = this.questions.length;
		if (matchesKey(data, "up") || data === "k") choice.highlight = Math.max(0, choice.highlight - 1);
		else if (matchesKey(data, "down") || data === "j") choice.highlight = Math.min(this.question().options.length, choice.highlight + 1);
		else if (count > 1 && (matchesKey(data, "tab") || matchesKey(data, "right"))) this.goTo((this.index + 1) % count);
		else if (count > 1 && (matchesKey(data, "shift+tab") || matchesKey(data, "left"))) this.goTo((this.index + count - 1) % count);
		else return false;
		return true;
	}

	private answerKey(data: string): boolean {
		const question = this.question();
		const choice = this.choice();
		if (data.length === 1 && data >= "1" && data <= "9") {
			const picked = Number(data) - 1;
			if (picked > question.options.length) return true;
			choice.highlight = picked;
			if (picked === question.options.length) this.setTyping(true);
			else if (question.multiSelect) this.toggle(picked);
			else this.confirm();
		} else if (matchesKey(data, "space") && question.multiSelect) this.toggle(choice.highlight);
		else if (matchesKey(data, "enter")) this.confirm();
		else return false;
		return true;
	}

	private toggle(index: number): void {
		const label = this.question().options[index]?.label;
		if (label === undefined) return;
		const { picked } = this.choice();
		if (picked.has(label)) picked.delete(label);
		else picked.add(label);
	}

	private confirm(): void {
		const question = this.question();
		const choice = this.choice();
		if (choice.highlight === question.options.length) {
			this.setTyping(true);
			return;
		}
		const highlighted = question.options[choice.highlight]?.label;
		if (question.multiSelect && choice.picked.size === 0 && highlighted !== undefined) choice.picked.add(highlighted);
		const selected = question.multiSelect
			? question.options.filter((option) => choice.picked.has(option.label)).map((option) => option.label)
			: highlighted === undefined
				? []
				: [highlighted];
		if (selected.length === 0) return;
		this.answers[question.id] = { selected };
		this.next();
	}

	private next(): void {
		const open = this.questions.findIndex((question) => this.answers[question.id] === undefined);
		if (open === -1) this.ending = "answered";
		else this.goTo(open);
	}

	private goTo(index: number): void {
		this.index = index;
		this.setTyping(this.question().options.length === 0);
	}

	private setTyping(on: boolean): void {
		this.typing = on;
		if (on) this.input.setValue(this.choice().ownText ?? "");
		this.input.focused = this.hasFocus && on;
	}
}
