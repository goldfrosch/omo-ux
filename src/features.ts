export interface FeatureState {
	ok: boolean;
	detail?: string;
}

/** Records which features came up so `/ux` can report what runs and what degraded. */
export class FeatureLog {
	private readonly states = new Map<string, FeatureState>();

	/** Runs one feature's setup. A failure disables only that feature and is reported, never thrown. */
	run(name: string, setup: () => void, onError: (message: string) => void): void {
		try {
			setup();
			this.states.set(name, { ok: true });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.states.set(name, { ok: false, detail: message });
			onError(message);
		}
	}

	entries(): [string, FeatureState][] {
		return [...this.states];
	}
}
