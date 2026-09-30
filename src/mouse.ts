import { join } from "node:path";
import { MOUSE_TRACKING, type TUI } from "@earendil-works/pi-tui";
import { readSettings } from "./doctor.ts";

/** Frames arrive many times a second while streaming; one re-send per interval is plenty. */
const RESEND_INTERVAL_MS = 1000;

/** Hooks run by the footer, the one component that renders on every frame while the TUI runs. */
export interface FrameObserver {
	frame(tui: TUI): void;
	invalidate(): void;
}

export interface MouseKeeper extends FrameObserver {
	/** Set on every session_start: false when the user turned mouse capture off. */
	setWanted(wanted: boolean): void;
}

/**
 * Keeps fullscreen wheel scrolling alive on Windows.
 *
 * ConPTY (the OpenConsole that WezTerm and Windows Terminal bundle) forwards an app's mouse-mode sequences
 * to the terminal only while the console is in VT-input mode. senpi's fullscreen renderer writes them just
 * before it switches the console to raw VT input, so a TUI (re)start from a cooked console, such as the
 * return from the external editor, leaves the terminal without mouse reporting. In the alternate screen the
 * terminal then sends Up/Down for the wheel, which the editor reads as prompt history. Re-sending the host's
 * own sequence while the TUI runs restores reporting; a terminal that already reports ignores it.
 */
export function createMouseKeeper(): MouseKeeper {
	const sequence = isMultiplexer() ? MOUSE_TRACKING.buttonMotion : MOUSE_TRACKING.allMotion;
	let wanted = false;
	let lastSent = 0;
	return {
		setWanted(value) {
			wanted = value && process.platform === "win32";
			lastSent = 0;
		},
		frame(tui) {
			if (!wanted || tui.mode !== "fullscreen") return;
			const now = Date.now();
			if (now - lastSent < RESEND_INTERVAL_MS) return;
			lastSent = now;
			// Components render before the frame is written; send after the frame, never inside it.
			queueMicrotask(() => tui.terminal.write(sequence));
		},
		invalidate() {
			// The host invalidates every component when it swaps renderers; re-send on the next frame.
			lastSent = 0;
		},
	};
}

/** senpi builds its fullscreen renderer without mouse capture only when `terminal.mouse` is "off". */
export function mouseCaptureWanted(agentDir: string): boolean {
	const settings = readSettings(join(agentDir, "settings.json"));
	// senpi falls back to its default ("whilePending", capture on) for an unreadable file; `/ux` reports it.
	if (typeof settings === "string") return true;
	const terminal = settings.terminal;
	return !(typeof terminal === "object" && terminal !== null && (terminal as Record<string, unknown>).mouse === "off");
}

/** Same choice as the host's fullscreen renderer: multiplexers get button-motion tracking only. */
function isMultiplexer(): boolean {
	const term = process.env.TERM?.toLowerCase() ?? "";
	return (
		process.env.TMUX !== undefined ||
		process.env.ZELLIJ !== undefined ||
		process.env.STY !== undefined ||
		term.startsWith("tmux") ||
		term.startsWith("screen")
	);
}
