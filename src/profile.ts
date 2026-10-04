/**
 * Everything omo-ux asks of the host, in one place. scripts/setup.ts writes it, `/ux` verifies it,
 * and no other module hard-codes these values. Keep this file free of host imports so the setup
 * script can run under plain bun, outside omo.
 */

export const THEME_NAME = "opencode-ux";
export const PALETTE_KEY = "ctrl+p";
export const READER_KEY = "f3";

/** senpi versions this profile was verified against. Others still load; `/ux` only flags them. */
export const TESTED_SENPI_VERSIONS: readonly string[] = ["2026.9.26", "2026.10.5"];

export const DESIRED_SETTINGS = {
	tuiMode: "fullscreen",
	quietStartup: true,
	tips: false,
	theme: THEME_NAME,
} as const;

/**
 * Built-in actions bound to ctrl+p by default. app.model.cycleForward is reserved, so the host
 * skips any extension shortcut on ctrl+p until it moves; the two picker-only actions would still
 * trigger a conflict warning, so they move too.
 */
export const PALETTE_BLOCKERS: readonly string[] = [
	"app.model.cycleForward",
	"app.session.togglePath",
	"app.models.toggleProvider",
];

/** Model cycling moves to F2 / Shift+F2 (opencode's defaults); Alt+P keeps meaning "previous model". */
export const DESIRED_KEYBINDINGS: Readonly<Record<string, readonly string[]>> = {
	"app.model.cycleForward": ["f2"],
	"app.model.cycleBackward": ["shift+f2", "alt+p"],
	"app.session.togglePath": ["alt+p"],
	"app.models.toggleProvider": ["alt+p"],
};

/** senpi built-in extensions omo-ux replaces: ask-user's question window gives way to the decision screen. */
export const DISABLED_BUILTINS: readonly string[] = ["ask-user"];

/** Status keys the footer never shows (compared after trimming). omo publishes its badge as "  omo-native". */
export const HIDDEN_STATUS_KEYS: readonly string[] = ["omo-native"];
