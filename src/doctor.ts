import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type ExtensionContext, type Theme, VERSION } from "@code-yeongyu/senpi";
import type { Component, Keybinding, KeybindingsManager } from "@earendil-works/pi-tui";
import type { FeatureLog } from "./features.ts";
import { DESIRED_SETTINGS, PALETTE_BLOCKERS, PALETTE_KEY, TESTED_SENPI_VERSIONS, THEME_NAME } from "./profile.ts";
import { createFrame } from "./ui.ts";

type Level = "ok" | "warn" | "fail";

interface Check {
	level: Level;
	text: string;
}

/** Built-in actions still bound to the palette key. While any remain, the host skips the shortcut. */
export function paletteBlockers(keybindings: KeybindingsManager): string[] {
	return PALETTE_BLOCKERS.filter((id) =>
		keybindings.getKeys(id as Keybinding).some((key) => key.toLowerCase() === PALETTE_KEY),
	);
}

export async function showDoctor(
	ctx: ExtensionContext,
	features: FeatureLog,
	commandsLive: boolean,
	setupHint: string,
): Promise<void> {
	await ctx.ui.custom<void>(
		(_tui, theme, keybindings, done) => new DoctorView(runChecks(ctx, keybindings, features, commandsLive), setupHint, theme, done),
		{ overlay: true, overlayOptions: { anchor: "center", width: "72%", minWidth: 56 } },
	);
}

function runChecks(
	ctx: ExtensionContext,
	keybindings: KeybindingsManager,
	features: FeatureLog,
	commandsLive: boolean,
): Check[] {
	const checks: Check[] = [];
	checks.push(
		TESTED_SENPI_VERSIONS.includes(VERSION)
			? { level: "ok", text: `senpi ${VERSION} (tested)` }
			: { level: "warn", text: `senpi ${VERSION} untested (tested: ${TESTED_SENPI_VERSIONS.join(", ")}); look over the UI once` },
	);
	const settings = readSettings(join(ctx.agentDir, "settings.json"));
	if (typeof settings === "string") {
		checks.push({ level: "fail", text: settings });
	} else {
		for (const [key, want] of Object.entries(DESIRED_SETTINGS)) {
			const got = settings[key];
			checks.push(
				got === want
					? { level: "ok", text: `${key} = ${JSON.stringify(want)}` }
					: { level: "fail", text: `${key} = ${JSON.stringify(got)} (want ${JSON.stringify(want)})` },
			);
		}
	}
	const blockers = paletteBlockers(keybindings);
	checks.push(
		blockers.length === 0
			? { level: "ok", text: `${PALETTE_KEY} opens the palette` }
			: { level: "fail", text: `${PALETTE_KEY} still bound to ${blockers.join(", ")}; use /ux palette until fixed` },
	);
	checks.push(
		ctx.ui.getTheme(THEME_NAME)
			? { level: "ok", text: `theme ${THEME_NAME} available` }
			: { level: "fail", text: `theme ${THEME_NAME} not loaded` },
	);
	for (const [name, state] of features.entries()) {
		checks.push(state.ok ? { level: "ok", text: `${name}: active` } : { level: "fail", text: `${name}: ${state.detail ?? "failed"}` });
	}
	checks.push(
		commandsLive
			? { level: "ok", text: "command list: live from autocomplete" }
			: { level: "warn", text: "command list: built-in snapshot (autocomplete hook unavailable)" },
	);
	return checks;
}

export function readSettings(path: string): Record<string, unknown> | string {
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
		if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return `${path} is not a JSON object`;
		return parsed as Record<string, unknown>;
	} catch (error) {
		return `cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`;
	}
}

class DoctorView implements Component {
	private readonly checks: readonly Check[];
	private readonly setupHint: string;
	private readonly theme: Theme;
	private readonly done: () => void;

	constructor(checks: readonly Check[], setupHint: string, theme: Theme, done: () => void) {
		this.checks = checks;
		this.setupHint = setupHint;
		this.theme = theme;
		this.done = done;
	}

	handleInput(_data: string): void {
		this.done();
	}

	render(width: number): string[] {
		const theme = this.theme;
		const frame = createFrame(theme, width);
		const icon: Record<Level, string> = {
			ok: theme.fg("success", "✓"),
			warn: theme.fg("warning", "!"),
			fail: theme.fg("error", "✗"),
		};
		const failures = this.checks.filter((check) => check.level === "fail").length;
		const lines = [frame.top("omo-ux doctor", failures > 0 ? `${failures} to fix` : "all good")];
		for (const check of this.checks) lines.push(frame.row(`${icon[check.level]} ${check.text}`));
		if (failures > 0) {
			lines.push(frame.rule());
			lines.push(frame.row(theme.fg("muted", `fix: ${this.setupHint}`)));
		}
		lines.push(frame.rule());
		lines.push(frame.row(theme.fg("dim", "any key closes")));
		lines.push(frame.bottom());
		return lines;
	}

	invalidate(): void {}
}
