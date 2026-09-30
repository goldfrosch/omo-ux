import type { ExtensionContext, KeybindingsManager, Theme } from "@code-yeongyu/senpi";
import {
	type Component,
	type Focusable,
	fuzzyFilter,
	Input,
	type Keybinding,
	matchesKey,
	type TUI,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";
import type { CommandEntry, CommandSource } from "./commands.ts";
import { PALETTE_KEY } from "./profile.ts";
import { createFrame, fit, joinEnds } from "./ui.ts";

export interface PaletteItem {
	kind: "command" | "skill" | "shortcut";
	/** Left column: "/name" for commands, the key chord for shortcuts. */
	primary: string;
	description: string;
	/** Right column: the chord of the action equivalent to a command, if one is bound. */
	keys: string;
	search: string;
}

type Mode = "all" | "commands" | "shortcuts";
const MODES: readonly Mode[] = ["all", "commands", "shortcuts"];
const MODE_TITLE: Record<Mode, string> = { all: "Commands & shortcuts", commands: "Commands", shortcuts: "Shortcuts" };

/** Global actions that do what a slash command does, so the chord can sit next to the command. */
const COMMAND_ACTIONS: Readonly<Record<string, string>> = {
	model: "app.model.select",
	new: "app.session.new",
	tree: "app.session.tree",
	fork: "app.session.fork",
	resume: "app.session.resume",
	rename: "app.session.renameCurrent",
};

/** Actions that only work inside one picker; /hotkeys still lists them. */
const PICKER_SCOPED = /^app\.(tree|models)\.|^app\.session\.(toggle|rename$|delete)/;
const EDITOR_ESSENTIALS: readonly string[] = [
	"tui.input.newLine",
	"tui.editor.undo",
	"tui.editor.yank",
	"tui.editor.deleteWordBackward",
	"tui.editor.deleteToLineStart",
];

export async function openPalette(ctx: ExtensionContext, source: CommandSource): Promise<void> {
	const list = await source.list();
	const note = list.live ? undefined : `offline command list${list.error ? `: ${list.error}` : ""}`;
	const choice = await ctx.ui.custom<PaletteItem | undefined>(
		(tui, theme, keybindings, done) =>
			new PaletteView(buildItems(list.entries, keybindings), { tui, theme, keybindings, done, note }),
		{ overlay: true, overlayOptions: { anchor: "top-center", width: "72%", minWidth: 56, maxHeight: "90%", offsetY: 1 } },
	);
	if (!choice) return;
	if (choice.kind === "shortcut") {
		// Built-in actions cannot be triggered from an extension; show the chord to press instead.
		ctx.ui.notify(`${choice.primary}  ${choice.description}`, "info");
		return;
	}
	// Built-in commands only run from the editor, so the palette fills it in; Enter runs it.
	const draft = ctx.ui.getEditorText().trim();
	if (draft && draft !== choice.primary) {
		const replace = await ctx.ui.confirm("Replace draft?", `The editor has unsent text. Replace it with ${choice.primary}?`);
		if (!replace) return;
	}
	ctx.ui.setEditorText(choice.primary);
}

function buildItems(commands: readonly CommandEntry[], keybindings: KeybindingsManager): PaletteItem[] {
	const keysOf = (id: string) => keybindings.getKeys(id as Keybinding).join(" / ");
	const commandItems: PaletteItem[] = [];
	const skillItems: PaletteItem[] = [];
	for (const command of commands) {
		const action = COMMAND_ACTIONS[command.name];
		// senpi's autocomplete adds a scope tag such as "[s]" or "[u:npm:pkg]" (after any argument hint);
		// it is noise in a palette. Argument hints like "[name]" never match this one-letter shape.
		const description = (command.description ?? "").replace(/(^|— )\[[a-z](?::[^\]]*)?\]\s*/, "$1");
		(command.kind === "skill" ? skillItems : commandItems).push({
			kind: command.kind,
			primary: `/${command.name}`,
			description,
			keys: action ? keysOf(action) : "",
			search: `${command.name} ${description}`,
		});
	}
	const shortcutItems: PaletteItem[] = [];
	for (const id of Object.keys(keybindings.getResolvedBindings())) {
		const inScope = id.startsWith("app.") || id.startsWith("tui.altScreen.") || EDITOR_ESSENTIALS.includes(id);
		if (!inScope || PICKER_SCOPED.test(id)) continue;
		const keys = keysOf(id);
		if (!keys) continue;
		const description = keybindings.getDefinition(id as Keybinding).description ?? id;
		shortcutItems.push({ kind: "shortcut", primary: keys, description, keys: "", search: `${description} ${keys} ${id}` });
	}
	return [...commandItems, ...shortcutItems, ...skillItems];
}

interface ViewDeps {
	tui: TUI;
	theme: Theme;
	keybindings: KeybindingsManager;
	done: (item: PaletteItem | undefined) => void;
	note?: string;
}

class PaletteView implements Component, Focusable {
	private readonly items: readonly PaletteItem[];
	private readonly deps: ViewDeps;
	private readonly input = new Input({ prompt: "> ", placeholder: "type to filter" });
	private readonly widestPrimary: number;
	private mode: Mode = "all";
	private shown: PaletteItem[] = [];
	private selected = 0;
	private scroll = 0;
	private hasFocus = false;

	constructor(items: readonly PaletteItem[], deps: ViewDeps) {
		this.items = items;
		this.deps = deps;
		this.widestPrimary = Math.max(8, ...items.map((item) => visibleWidth(item.primary)));
		this.refilter();
	}

	// The embedded Input needs focus propagated so the IME candidate window lands on the cursor.
	get focused(): boolean {
		return this.hasFocus;
	}

	set focused(value: boolean) {
		this.hasFocus = value;
		this.input.focused = value;
	}

	handleInput(data: string): void {
		const { keybindings, done, tui } = this.deps;
		if (matchesKey(data, PALETTE_KEY) || keybindings.matches(data, "tui.select.cancel")) {
			done(undefined);
			return;
		}
		if (keybindings.matches(data, "tui.select.confirm")) {
			done(this.shown[this.selected]);
			return;
		}
		if (keybindings.matches(data, "tui.input.tab")) this.cycleMode();
		else if (keybindings.matches(data, "tui.select.up")) this.move(-1);
		else if (keybindings.matches(data, "tui.select.down")) this.move(1);
		else if (keybindings.matches(data, "tui.select.pageUp")) this.move(-this.pageSize());
		else if (keybindings.matches(data, "tui.select.pageDown")) this.move(this.pageSize());
		else {
			const before = this.input.getValue();
			this.input.handleInput(data);
			if (this.input.getValue() !== before) this.refilter();
		}
		tui.requestRender();
	}

	render(width: number): string[] {
		const { theme, note } = this.deps;
		const frame = createFrame(theme, width);
		const inner = frame.innerWidth;
		const lines = [frame.top(MODE_TITLE[this.mode], "esc"), frame.row(this.input.render(inner)[0] ?? ""), frame.rule()];
		const page = this.pageSize();
		const visible = this.shown.slice(this.scroll, this.scroll + page);
		if (visible.length === 0) lines.push(frame.row(theme.fg("dim", "No matches")));
		visible.forEach((item, offset) => {
			const isSelected = this.scroll + offset === this.selected;
			const background = isSelected ? (text: string) => theme.bg("selectedBg", text) : undefined;
			lines.push(frame.row(this.formatItem(item, inner, isSelected), background));
		});
		// Keep the height stable while filtering so the panel does not jump.
		for (let filler = Math.max(visible.length, 1); filler < page; filler++) lines.push(frame.row(""));
		lines.push(frame.rule());
		const position = this.shown.length > 0 ? `${this.selected + 1}/${this.shown.length}` : "0/0";
		const help = note ? theme.fg("warning", note) : theme.fg("dim", "↑↓ move · enter pick · tab mode · esc close");
		lines.push(frame.row(joinEnds(help, theme.fg("dim", position), inner)));
		lines.push(frame.bottom());
		return lines.map((line) => (visibleWidth(line) > width ? truncateToWidth(line, width) : line));
	}

	invalidate(): void {
		this.input.invalidate();
	}

	private formatItem(item: PaletteItem, inner: number, selected: boolean): string {
		const { theme } = this.deps;
		const marker = selected ? theme.fg("accent", "› ") : "  ";
		const primaryWidth = Math.min(this.widestPrimary, 26, Math.max(8, Math.floor(inner * 0.4)));
		const primaryColor = selected ? "accent" : item.kind === "shortcut" ? "mdCode" : item.kind === "skill" ? "muted" : "text";
		const primary = theme.fg(primaryColor, fit(item.primary, primaryWidth));
		const keys = item.keys ? theme.fg("dim", item.keys) : "";
		const keysWidth = keys ? visibleWidth(keys) + 1 : 0;
		const description = theme.fg("muted", fit(item.description, Math.max(0, inner - 2 - primaryWidth - 2 - keysWidth)));
		return `${marker}${primary}  ${description}${keys ? ` ${keys}` : ""}`;
	}

	private refilter(): void {
		const pool = this.items.filter(
			(item) => this.mode === "all" || (this.mode === "shortcuts") === (item.kind === "shortcut"),
		);
		const query = this.input.getValue().trim().replace(/^\//, "");
		this.shown = query ? fuzzyFilter(pool, query, (item) => item.search) : pool;
		this.selected = 0;
		this.scroll = 0;
	}

	private cycleMode(): void {
		this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length] ?? "all";
		this.refilter();
	}

	private move(delta: number): void {
		const count = this.shown.length;
		if (count === 0) return;
		// Single steps wrap around like opencode's list; page jumps clamp.
		if (Math.abs(delta) === 1) this.selected = (this.selected + delta + count) % count;
		else this.selected = Math.max(0, Math.min(count - 1, this.selected + delta));
		const page = this.pageSize();
		if (this.selected < this.scroll) this.scroll = this.selected;
		else if (this.selected >= this.scroll + page) this.scroll = this.selected - page + 1;
	}

	private pageSize(): number {
		return Math.max(5, Math.min(20, (process.stdout.rows || 30) - 12));
	}
}
