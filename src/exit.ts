import { CustomEditor, type ExtensionContext } from "@code-yeongyu/senpi";
import { getKeybindings, isKeyRelease, type Keybinding, type TUI, TuiAltScreen } from "@earendil-works/pi-tui";

/**
 * opencode-style Ctrl+C in the main editor: with text it still clears (senpi's own `app.clear`), on an empty
 * editor it exits at once instead of waiting for a second press within 500 ms. A running turn is aborted so
 * the exit does not wait for it. Pickers, dialogs, overlays and an active fullscreen selection keep their
 * own Ctrl+C. Follows whatever key `app.clear` is bound to (Ctrl+C by default).
 */
export function installCtrlCExit(ctx: ExtensionContext, tui: () => TUI | undefined): () => void {
	return ctx.ui.onTerminalInput((data) => {
		if (!getKeybindings().matches(data, "app.clear" as Keybinding) || isKeyRelease(data)) return undefined;
		const current = tui();
		if (!current || !(current.getFocusedComponent() instanceof CustomEditor)) return undefined;
		if (ctx.ui.getEditorText() !== "") return undefined;
		if (current instanceof TuiAltScreen && current.hasActiveSelection()) return undefined;
		// shutdown() alone waits for a busy session to settle; aborting makes that immediate.
		const busy = !ctx.isIdle();
		ctx.shutdown();
		if (busy) ctx.abort();
		return { consume: true };
	});
}
