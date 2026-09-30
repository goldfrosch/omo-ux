import type { ExtensionAPI, ExtensionContext } from "@code-yeongyu/senpi";
import type { AutocompleteItem, AutocompleteProvider } from "@earendil-works/pi-tui";

export interface CommandEntry {
	/** Invocation name without the leading slash, e.g. "model" or "skill:debugging". */
	name: string;
	description?: string;
	kind: "command" | "skill";
}

export interface CommandList {
	entries: CommandEntry[];
	/** True when the list came from the editor's own autocomplete provider. */
	live: boolean;
	/** Why the live list was unavailable, when it was. */
	error?: string;
}

export interface CommandSource {
	/** Must run on every session_start: the host drops provider wrappers when it rebinds. */
	attach(ctx: ExtensionContext): void;
	list(): Promise<CommandList>;
}

/**
 * Built-in interactive commands of senpi 2026.9.26. They are not exported publicly, so this
 * snapshot is only the fallback; the live autocomplete path follows senpi updates on its own.
 */
const BUILTIN_SNAPSHOT: readonly CommandEntry[] = [
	["settings", "Open settings menu"],
	["model", "Select model (opens selector UI)"],
	["tree", "Navigate session tree (switch branches)"],
	["thinking", "Set thinking level"],
	["scoped-models", "Enable/disable models for cycling"],
	["favorite-models", "Manage favorite models for cycling"],
	["export", "Export session (HTML default, or specify path: .html/.jsonl)"],
	["import", "Import and resume a session from a JSONL file"],
	["share", "Share session as a secret GitHub gist"],
	["copy", "Copy last agent message to clipboard"],
	["rename", "Rename the current session"],
	["name", "Alias of /rename (set session display name)"],
	["session", "Show session info and stats"],
	["changelog", "Show changelog entries"],
	["hotkeys", "Show all keyboard shortcuts"],
	["fork", "Create a new fork from a previous user message"],
	["clone", "Duplicate the current session at the current position"],
	["trust", "Save project trust decision for future sessions"],
	["login", "Configure provider authentication"],
	["logout", "Remove provider authentication"],
	["new", "Start a new session"],
	["compact", "Manually compact the session context"],
	["resume", "Resume a different session"],
	["reload", "Reload keybindings, extensions, skills, prompts, themes, and context files"],
	["quit", "Quit"],
	["exit", "Quit (alias of /quit)"],
].map(([name, description]) => ({ name: name as string, description, kind: "command" as const }));

/** Built-ins first in senpi's own order, then other commands, then skills; ties alphabetical. */
const PREFERRED = new Map(BUILTIN_SNAPSHOT.map((entry, index) => [entry.name, index]));
function byPreference(a: CommandEntry, b: CommandEntry): number {
	const rank = (entry: CommandEntry) => (entry.kind === "skill" ? 2 : PREFERRED.has(entry.name) ? 0 : 1);
	return (
		rank(a) - rank(b) ||
		(PREFERRED.get(a.name) ?? 0) - (PREFERRED.get(b.name) ?? 0) ||
		a.name.localeCompare(b.name)
	);
}

export function createCommandSource(pi: ExtensionAPI): CommandSource {
	let provider: AutocompleteProvider | undefined;
	return {
		attach(ctx) {
			provider = undefined;
			// Pass-through wrapper: it only keeps a handle on the provider the editor already uses.
			ctx.ui.addAutocompleteProvider((current) => {
				provider = current;
				return current;
			});
		},
		async list() {
			if (!provider) return { entries: fromPublicApi(pi), live: false, error: "autocomplete hook not attached" };
			try {
				const entries = await fromProvider(provider);
				if (entries.length > 0) return { entries, live: true };
				return { entries: fromPublicApi(pi), live: false, error: "autocomplete returned no commands" };
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return { entries: fromPublicApi(pi), live: false, error: message };
			}
		},
	};
}

/** "/" lists built-ins, prompts, and extension commands; skills only appear under "/skill:". */
async function fromProvider(provider: AutocompleteProvider): Promise<CommandEntry[]> {
	const { signal } = new AbortController();
	const [commands, skills] = await Promise.all([
		provider.getSuggestions(["/"], 0, 1, { signal }),
		provider.getSuggestions(["/skill:"], 0, 7, { signal }),
	]);
	const seen = new Set<string>();
	const entries: CommandEntry[] = [];
	const add = (item: AutocompleteItem) => {
		if (seen.has(item.value) || item.value === "skill:") return;
		seen.add(item.value);
		entries.push({
			name: item.value,
			description: item.description,
			kind: item.value.startsWith("skill:") ? "skill" : "command",
		});
	};
	for (const item of commands?.items ?? []) add(item);
	for (const item of skills?.items ?? []) add(item);
	return entries.sort(byPreference);
}

function fromPublicApi(pi: ExtensionAPI): CommandEntry[] {
	const registered = pi.getCommands().map(
		(command): CommandEntry => ({
			name: command.name,
			description: command.description,
			kind: command.source === "skill" ? "skill" : "command",
		}),
	);
	const names = new Set(registered.map((entry) => entry.name));
	return [...BUILTIN_SNAPSHOT.filter((entry) => !names.has(entry.name)), ...registered].sort(byPreference);
}
