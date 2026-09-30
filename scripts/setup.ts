/**
 * Applies the omo-ux profile to omo's agent dir and registers this package there.
 *
 *   bun scripts/setup.ts              apply (idempotent; re-run after an omo update if /ux reports drift)
 *   bun scripts/setup.ts --check      report drift only; exits 1 when something is off
 *   bun scripts/setup.ts --uninstall  put back every value this script changed
 *
 * The agent dir follows omo's own rule: OMO_CODING_AGENT_DIR, SENPI_CODING_AGENT_DIR,
 * PI_CODING_AGENT_DIR, then ~/.omo/agent. Previous values live in omo-ux.state.json inside that
 * dir, and every rewritten file keeps a timestamped *.omo-ux-backup-* copy.
 */
import { copyFileSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DESIRED_KEYBINDINGS, DESIRED_SETTINGS, PALETTE_BLOCKERS, PALETTE_KEY } from "../src/profile.ts";

type JsonObject = Record<string, unknown>;

/** A key's value before omo-ux touched it; `existed: false` means the key was absent. */
interface Previous {
	existed: boolean;
	value?: unknown;
}

interface SetupState {
	version: 1;
	settings: Record<string, Previous>;
	keybindings: Record<string, Previous>;
	addedPackage: boolean;
	hadPackagesKey: boolean;
	createdKeybindings: boolean;
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const agentDir = resolveAgentDir(process.env);
const paths = {
	settings: join(agentDir, "settings.json"),
	keybindings: join(agentDir, "keybindings.json"),
	state: join(agentDir, "omo-ux.state.json"),
};

function resolveAgentDir(env: NodeJS.ProcessEnv): string {
	for (const name of ["OMO_CODING_AGENT_DIR", "SENPI_CODING_AGENT_DIR", "PI_CODING_AGENT_DIR"]) {
		const configured = env[name]?.trim();
		if (configured) return resolve(configured);
	}
	return join(env.HOME || env.USERPROFILE || homedir(), ".omo", "agent");
}

/** Missing file reads as undefined; a broken file aborts before anything is written. */
function readObject(path: string): JsonObject | undefined {
	if (!existsSync(path)) return undefined;
	const parsed: unknown = JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${path} is not a JSON object`);
	return parsed as JsonObject;
}

function writeObject(path: string, value: JsonObject): void {
	const text = `${JSON.stringify(value, null, 2)}\n`;
	if (existsSync(path)) {
		if (readFileSync(path, "utf8") === text) return;
		copyFileSync(path, `${path}.omo-ux-backup-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "")}`);
	}
	const temp = `${path}.omo-ux-tmp`;
	writeFileSync(temp, text, "utf8");
	renameSync(temp, path);
}

function readState(): SetupState | undefined {
	const state = readObject(paths.state);
	if (state === undefined) return undefined;
	if (state.version !== 1) throw new Error(`${paths.state} has an unknown format`);
	return state as unknown as SetupState;
}

function samePath(a: string, b: string): boolean {
	const fold = (path: string) => (process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path));
	return fold(a) === fold(b);
}

/** Local package entries resolve against the settings file's directory, as senpi resolves them. */
function isThisPackage(entry: unknown): boolean {
	const source = typeof entry === "string" ? entry : (entry as { source?: unknown } | null)?.source;
	if (typeof source !== "string" || /^(npm|git):|^[a-z][a-z0-9+.-]+:\/\//i.test(source)) return false;
	const expanded = source.startsWith("~") ? join(homedir(), source.slice(1)) : source;
	return samePath(resolve(agentDir, expanded), packageRoot);
}

function toKeys(value: unknown): string[] {
	if (typeof value === "string") return [value.toLowerCase()];
	if (Array.isArray(value)) return value.filter((key): key is string => typeof key === "string").map((key) => key.toLowerCase());
	return [];
}

/** An action needs our binding while it still uses the default or maps the palette key. */
const needsOverride = (current: unknown) => current === undefined || toKeys(current).includes(PALETTE_KEY);
const remember = (object: JsonObject, key: string): Previous =>
	key in object ? { existed: true, value: object[key] } : { existed: false };
const show = (value: unknown) => (value === undefined ? "(default)" : JSON.stringify(value));

function apply(): string[] {
	if (!existsSync(agentDir)) throw new Error(`agent dir ${agentDir} does not exist; start omo once first`);
	const settings = readObject(paths.settings) ?? {};
	const keybindingsExisted = existsSync(paths.keybindings);
	const keybindings = readObject(paths.keybindings) ?? {};
	const state: SetupState = readState() ?? {
		version: 1,
		settings: {},
		keybindings: {},
		addedPackage: false,
		hadPackagesKey: "packages" in settings,
		createdKeybindings: false,
	};
	const changes: string[] = [];

	const nextKeybindings: JsonObject = { ...keybindings };
	for (const [id, keys] of Object.entries(DESIRED_KEYBINDINGS)) {
		if (!needsOverride(keybindings[id])) continue; // already off ctrl+p, possibly by the user's own choice
		state.keybindings[id] ??= remember(keybindings, id);
		nextKeybindings[id] = [...keys];
		changes.push(`keybindings ${id}: ${show(keybindings[id])} -> ${JSON.stringify(keys)}`);
	}
	if (changes.length > 0 && !keybindingsExisted) state.createdKeybindings = true;

	const nextSettings: JsonObject = { ...settings };
	for (const [key, value] of Object.entries(DESIRED_SETTINGS)) {
		if (settings[key] === value) continue;
		state.settings[key] ??= remember(settings, key);
		nextSettings[key] = value;
		changes.push(`settings ${key}: ${show(settings[key])} -> ${JSON.stringify(value)}`);
	}
	const packages = Array.isArray(settings.packages) ? settings.packages : [];
	if (!packages.some(isThisPackage)) {
		nextSettings.packages = [...packages, packageRoot];
		state.addedPackage = true;
		changes.push(`settings packages: + ${packageRoot}`);
	}

	if (changes.length === 0) return changes;
	// State first: if a later write fails, --uninstall still knows every original value.
	writeObject(paths.state, state as unknown as JsonObject);
	if (!keybindingsExisted || JSON.stringify(nextKeybindings) !== JSON.stringify(keybindings)) {
		writeObject(paths.keybindings, nextKeybindings);
	}
	writeObject(paths.settings, nextSettings);
	return changes;
}

/** Restores a key only while it still holds our value; a later change is the user's call. */
function restoreIfOurs(object: JsonObject, key: string, previous: Previous, ours: unknown): boolean {
	if (JSON.stringify(object[key]) !== JSON.stringify(ours)) return false;
	if (previous.existed) object[key] = previous.value;
	else delete object[key];
	return true;
}

function uninstall(): string[] {
	const state = readState();
	if (!state) throw new Error(`nothing to undo: ${paths.state} not found`);
	const changes: string[] = [];

	const keybindings = readObject(paths.keybindings) ?? {};
	for (const [id, previous] of Object.entries(state.keybindings)) {
		if (restoreIfOurs(keybindings, id, previous, DESIRED_KEYBINDINGS[id])) changes.push(`keybindings ${id} -> ${show(previous.value)}`);
	}
	if (state.createdKeybindings && Object.keys(keybindings).length === 0) {
		rmSync(paths.keybindings, { force: true });
		changes.push("keybindings.json removed (omo-ux created it)");
	} else if (existsSync(paths.keybindings)) {
		writeObject(paths.keybindings, keybindings);
	}

	const settings = readObject(paths.settings) ?? {};
	for (const [key, previous] of Object.entries(state.settings)) {
		const ours = (DESIRED_SETTINGS as Record<string, unknown>)[key];
		if (restoreIfOurs(settings, key, previous, ours)) changes.push(`settings ${key} -> ${show(previous.value)}`);
	}
	if (state.addedPackage && Array.isArray(settings.packages)) {
		const remaining = settings.packages.filter((entry) => !isThisPackage(entry));
		if (remaining.length === 0 && !state.hadPackagesKey) delete settings.packages;
		else settings.packages = remaining;
		changes.push(`settings packages: - ${packageRoot}`);
	}
	writeObject(paths.settings, settings);
	rmSync(paths.state, { force: true });
	return changes;
}

function drift(): string[] {
	const problems: string[] = [];
	const settings = readObject(paths.settings) ?? {};
	for (const [key, want] of Object.entries(DESIRED_SETTINGS)) {
		if (settings[key] !== want) problems.push(`settings ${key} is ${show(settings[key])}, want ${JSON.stringify(want)}`);
	}
	const packages = Array.isArray(settings.packages) ? settings.packages : [];
	if (!packages.some(isThisPackage)) problems.push(`settings packages does not list ${packageRoot}`);
	const keybindings = readObject(paths.keybindings) ?? {};
	for (const id of PALETTE_BLOCKERS) {
		if (needsOverride(keybindings[id])) problems.push(`keybindings ${id} still resolves to ${PALETTE_KEY}`);
	}
	return problems;
}

const mode = process.argv.includes("--uninstall") ? "uninstall" : process.argv.includes("--check") ? "check" : "apply";
try {
	console.log(`omo-ux ${mode} (agent dir: ${agentDir})`);
	if (mode !== "check") {
		const changes = mode === "apply" ? apply() : uninstall();
		for (const change of changes) console.log(`  ${change}`);
		if (changes.length === 0) console.log("  nothing to change");
	}
	if (mode !== "uninstall") {
		const problems = drift();
		for (const problem of problems) console.log(`  drift: ${problem}`);
		if (problems.length > 0) process.exitCode = 1;
		else console.log("  profile in place; omo hot-reloads it when idle (restart omo if the view does not switch)");
	}
} catch (error) {
	console.error(`omo-ux ${mode} failed: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
}
