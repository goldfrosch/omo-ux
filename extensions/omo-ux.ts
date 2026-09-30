import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@code-yeongyu/senpi";
import { getKeybindings } from "@earendil-works/pi-tui";
import { createCommandSource } from "../src/commands.ts";
import { paletteBlockers, showDoctor } from "../src/doctor.ts";
import { installCtrlCExit } from "../src/exit.ts";
import { FeatureLog } from "../src/features.ts";
import { createFooter } from "../src/footer.ts";
import { createMouseKeeper, mouseCaptureWanted } from "../src/mouse.ts";
import { openPalette } from "../src/palette.ts";
import { PALETTE_KEY } from "../src/profile.ts";
import { registerBlockingQuestions } from "../src/questions.ts";

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
	let stopCtrlC: (() => void) | undefined;

	registerBlockingQuestions(pi);

	pi.registerShortcut(PALETTE_KEY, {
		description: "Command palette: commands and shortcuts (omo-ux)",
		handler: (ctx) => openPalette(ctx, commands),
	});

	pi.registerCommand("ux", {
		description: "omo-ux: `/ux` checks the setup, `/ux palette` opens the palette",
		getArgumentCompletions: (prefix) =>
			["palette", "doctor"].filter((name) => name.startsWith(prefix)).map((name) => ({ value: name, label: name })),
		handler: async (args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("omo-ux: /ux needs the interactive TUI", "warning");
				return;
			}
			if (args.trim() === "palette") {
				await openPalette(ctx, commands);
				return;
			}
			const list = await commands.list();
			await showDoctor(ctx, features, list.live, setupHint());
		},
	});

	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI || ctx.mode !== "tui") return;
		// The host drops footer, autocomplete wrappers and input listeners on every rebind, so all are re-applied here.
		const report = (name: string) => (message: string) =>
			ctx.ui.notify(`omo-ux: ${name} disabled (${message})`, "warning");
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
		features.run("fullscreen mouse", () => mouse.setWanted(mouseCaptureWanted(ctx.agentDir)), report("fullscreen mouse"));
	});

	pi.on("session_shutdown", () => {
		stopCtrlC?.();
		stopCtrlC = undefined;
	});
}

function setupHint(): string {
	const here = fileURLToPath(import.meta.url);
	return `bun "${join(dirname(here), "..", "scripts", "setup.ts")}"`;
}
