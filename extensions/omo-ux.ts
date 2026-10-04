import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@code-yeongyu/senpi";
import { getKeybindings, type TUI } from "@earendil-works/pi-tui";
import { createAskTools } from "../src/ask-tool.ts";
import { createCommandSource } from "../src/commands.ts";
import { paletteBlockers, showDoctor } from "../src/doctor.ts";
import { installCtrlCExit } from "../src/exit.ts";
import { FeatureLog } from "../src/features.ts";
import { createFooter } from "../src/footer.ts";
import { prewrapMarkdown } from "../src/markdown-wrap.ts";
import { createMouseKeeper, mouseCaptureWanted } from "../src/mouse.ts";
import { openPalette } from "../src/palette.ts";
import { PALETTE_KEY } from "../src/profile.ts";
import { registerQuestionFlow, type Viewport } from "../src/questions.ts";
import { installReaderKey, readLatest } from "../src/reader.ts";
import { registerReadingRules } from "../src/rules.ts";

/**
 * omo-ux entry. Only public extension API is used: omo itself is never patched, so an omo update
 * can at worst disable a single feature, which `/ux` then reports.
 */
export default function omoUx(pi: ExtensionAPI): void {
	const features = new FeatureLog();
	const commands = createCommandSource(pi);
	const mouse = createMouseKeeper();
	// getKeybindings() is the host's live manager (set at startup, updated by /reload).
	const footer = createFooter(
		pi,
		() => (paletteBlockers(getKeybindings()).length === 0 ? `${PALETTE_KEY} commands` : undefined),
		mouse,
	);
	const askTools = createAskTools(pi);
	const questions = registerQuestionFlow(pi, () => viewportOf(footer.tui()), askTools.owns);
	let stopCtrlC: (() => void) | undefined;
	let stopReaderKey: (() => void) | undefined;

	// Load-time features have no UI to warn in yet; FeatureLog keeps the failure and `/ux` shows it.
	const keptForDoctor = () => undefined;
	features.run(
		"korean word wrap",
		() => pi.registerMarkdownTransformer((markdown, { availableWidth }) => prewrapMarkdown(markdown, availableWidth)),
		keptForDoctor,
	);
	features.run("reading rules", () => registerReadingRules(pi), keptForDoctor);

	pi.registerShortcut(PALETTE_KEY, {
		description: "Command palette: commands and shortcuts (omo-ux)",
		handler: (ctx) => openPalette(ctx, commands),
	});

	pi.registerCommand("ux", {
		description: "omo-ux: `/ux` checks the setup, `/ux palette` opens the palette, `/ux read` re-reads the last reply",
		getArgumentCompletions: (prefix) =>
			["palette", "read", "doctor"].filter((name) => name.startsWith(prefix)).map((name) => ({ value: name, label: name })),
		handler: async (args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("omo-ux: /ux needs the interactive TUI", "warning");
				return;
			}
			if (args.trim() === "palette") {
				await openPalette(ctx, commands);
				return;
			}
			if (args.trim() === "read") {
				await readLatest(ctx, questions.pending());
				return;
			}
			const list = await commands.list();
			await showDoctor(ctx, features, list.live, setupHint());
		},
	});

	pi.on("session_start", (_event, ctx) => {
		const tui = ctx.hasUI && ctx.mode === "tui";
		const report = (name: string) => (message: string) => {
			if (tui) ctx.ui.notify(`omo-ux: ${name} disabled (${message})`, "warning");
		};
		// The question tool stands in for senpi's in every mode; outside the TUI it uses the host's question UI or reports no user.
		features.run(
			"decision screen",
			() => {
				if (!askTools.install(ctx)) throw new Error(`senpi's question window is in use; run ${setupHint()} and restart omo`);
			},
			report("decision screen"),
		);
		if (!tui) return;
		// The host drops footer, autocomplete wrappers and input listeners on every rebind, so all are re-applied here.
		features.run("footer", () => footer.install(ctx), report("footer"));
		features.run("command list", () => commands.attach(ctx), report("command list"));
		features.run(
			"ctrl+c exit",
			() => {
				stopCtrlC?.();
				stopCtrlC = installCtrlCExit(ctx, footer.tui);
			},
			report("ctrl+c exit"),
		);
		features.run(
			"reader key",
			() => {
				stopReaderKey?.();
				stopReaderKey = installReaderKey(ctx, questions.pending);
			},
			report("reader key"),
		);
		features.run("fullscreen mouse", () => mouse.setWanted(mouseCaptureWanted(ctx.agentDir)), report("fullscreen mouse"));
	});

	pi.on("session_shutdown", () => {
		stopCtrlC?.();
		stopCtrlC = undefined;
		stopReaderKey?.();
		stopReaderKey = undefined;
	});
}

function viewportOf(tui: TUI | undefined): Viewport {
	return {
		columns: tui?.terminal.columns ?? process.stdout.columns ?? 80,
		rows: tui?.terminal.rows ?? process.stdout.rows ?? 24,
	};
}

function setupHint(): string {
	const here = fileURLToPath(import.meta.url);
	return `bun "${join(dirname(here), "..", "scripts", "setup.ts")}"`;
}
