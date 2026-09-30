import { homedir } from "node:os";
import { sep } from "node:path";
import type { ExtensionAPI, ExtensionContext, ReadonlyFooterDataProvider, Theme } from "@code-yeongyu/senpi";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { type TUI, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { FrameObserver } from "./mouse.ts";
import { HIDDEN_STATUS_KEYS } from "./profile.ts";
import { joinEnds } from "./ui.ts";

type Droppable = "hint" | "provider" | "cost" | "branch" | "statuses";
/** Dropped one at a time, in this order, until the line fits. The model name always stays. */
const DROP_ORDER: readonly Droppable[] = ["hint", "provider", "cost", "branch", "statuses"];

interface Parts {
	cwd: string;
	branch?: string;
	statuses: string[];
	context?: string;
	cost?: string;
	model: string;
	provider?: string;
	hint?: string;
}

export interface Footer {
	install(ctx: ExtensionContext): void;
	/** The host's live TUI reference (it follows renderer swaps) while the footer is mounted. */
	tui(): TUI | undefined;
}

/**
 * One-line footer replacing the built-in two-line one. Every value comes from public getters;
 * extension statuses stay visible except the omo badge. `frames` runs on every footer render.
 */
export function createFooter(pi: ExtensionAPI, hint: () => string | undefined, frames?: FrameObserver): Footer {
	let tui: TUI | undefined;
	let cost: number | undefined; // cached branch cost; undefined means "recompute on next render"
	const rerender = () => tui?.requestRender();
	const dropCost = () => {
		cost = undefined;
		rerender();
	};
	pi.on("message_end", dropCost);
	pi.on("session_tree", dropCost);
	pi.on("session_compact", dropCost);
	pi.on("model_select", rerender);
	pi.on("thinking_level_select", rerender);

	return {
		install(ctx) {
			cost = undefined;
			ctx.ui.setFooter((tuiRef, theme, footerData) => {
				tui = tuiRef;
				const unsubscribe = footerData.onBranchChange(() => tuiRef.requestRender());
				return {
					render(width: number): string[] {
						try {
							frames?.frame(tuiRef);
							cost ??= branchCost(ctx);
							return [layout(collectParts(ctx, pi, theme, footerData, cost, hint()), theme, width)];
						} catch (error) {
							const message = error instanceof Error ? error.message : String(error);
							return [truncateToWidth(theme.fg("error", `omo-ux footer: ${message}`), width)];
						}
					},
					invalidate() {
						frames?.invalidate();
					},
					dispose() {
						unsubscribe();
						if (tui === tuiRef) tui = undefined;
					},
				};
			});
		},
		tui: () => tui,
	};
}

function collectParts(
	ctx: ExtensionContext,
	pi: ExtensionAPI,
	theme: Theme,
	footerData: ReadonlyFooterDataProvider,
	cost: number,
	hint: string | undefined,
): Parts {
	const branch = footerData.getGitBranch();
	const model = ctx.model;
	const level = pi.getThinkingLevel();
	const usage = ctx.getContextUsage();
	let context: string | undefined;
	if (usage && usage.percent !== null) {
		const percent = Math.round(usage.percent);
		context = theme.fg(percent >= 85 ? "error" : percent >= 60 ? "warning" : "muted", `ctx ${percent}%`);
	}
	// Subscription providers report an API-equivalent cost, not a bill; mark it like the built-in footer.
	const subscription = model?.provider.includes("subscription") ?? false;
	return {
		cwd: theme.fg("muted", displayPath(ctx.cwd)),
		branch: branch ? theme.fg("dim", `(${branch})`) : undefined,
		statuses: visibleStatuses(footerData.getExtensionStatuses()),
		context,
		cost: cost > 0 ? theme.fg("muted", `$${cost.toFixed(2)}`) + (subscription ? theme.fg("dim", " (sub)") : "") : undefined,
		model: model
			? model.id + (model.reasoning && level !== "off" ? ` ${theme.getThinkingBorderColor(level)(level)}` : "")
			: theme.fg("warning", "no model"),
		provider: model && footerData.getAvailableProviderCount() > 1 ? theme.fg("dim", model.provider) : undefined,
		hint: hint ? theme.fg("dim", hint) : undefined,
	};
}

function layout(parts: Parts, theme: Theme, width: number): string {
	const dot = theme.fg("dim", " · ");
	const dropped = new Set<Droppable>();
	const compose = (): [string, string] => {
		const where = parts.cwd + (parts.branch && !dropped.has("branch") ? ` ${parts.branch}` : "");
		const left = [where, ...(dropped.has("statuses") ? [] : parts.statuses)].join(dot);
		const model = parts.model + (parts.provider && !dropped.has("provider") ? ` ${parts.provider}` : "");
		const right = [parts.context, dropped.has("cost") ? undefined : parts.cost, model, dropped.has("hint") ? undefined : parts.hint]
			.filter((part): part is string => Boolean(part))
			.join(dot);
		return [left, right];
	};
	let [left, right] = compose();
	for (const part of DROP_ORDER) {
		if (visibleWidth(left) + 1 + visibleWidth(right) <= width) break;
		dropped.add(part);
		[left, right] = compose();
	}
	return joinEnds(left, right, width);
}

function visibleStatuses(statuses: ReadonlyMap<string, string>): string[] {
	return [...statuses]
		.filter(([key]) => !HIDDEN_STATUS_KEYS.includes(key.trim()))
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([, text]) => text.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim())
		.filter((text) => visibleWidth(text) > 0);
}

function displayPath(cwd: string): string {
	const home = homedir();
	const fold = (path: string) => (process.platform === "win32" ? path.toLowerCase() : path);
	if (fold(cwd) === fold(home)) return "~";
	if (fold(cwd).startsWith(fold(home) + sep)) return `~${cwd.slice(home.length)}`;
	return cwd;
}

function branchCost(ctx: ExtensionContext): number {
	let total = 0;
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type === "message" && entry.message.role === "assistant") {
			total += (entry.message as AssistantMessage).usage?.cost?.total ?? 0;
		}
	}
	return total;
}
