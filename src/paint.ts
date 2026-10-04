import type { Theme, ThemeBg } from "@code-yeongyu/senpi";
import { fit } from "./ui.ts";

const SGR = /\x1b\[([0-9;:]*)m/g;

/**
 * One full-width line on a solid background. A cell without a background colour shows the terminal's own
 * background, which in WezTerm can be an image, so every cell is painted and the colour is applied again
 * after any reset inside the line.
 */
export function solidLine(theme: Theme, background: ThemeBg, text: string, width: number): string {
	const [open = "", close = ""] = theme.bg(background, "\u0000").split("\u0000");
	const body = fit(text, width).replace(SGR, (sequence: string, params: string) =>
		clearsBackground(params) ? sequence + open : sequence,
	);
	return open + body + close;
}

/** Whether an SGR parameter list resets attributes or the background colour; colour arguments are skipped. */
function clearsBackground(params: string): boolean {
	const list = params === "" ? ["0"] : params.split(/[;:]/);
	for (let index = 0; index < list.length; index++) {
		const param = list[index];
		if (param === "0" || param === "" || param === "49") return true;
		if (param === "38" || param === "48" || param === "58") index += list[index + 1] === "5" ? 2 : 4;
	}
	return false;
}
