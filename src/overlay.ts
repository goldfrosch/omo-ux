let openOverlays = 0;

export function overlayOpen(): boolean {
	return openOverlays > 0;
}

/** Marks an omo-ux full-screen overlay as open for as long as `show` runs, so the reader key stays out of its way. */
export async function holdOverlay<T>(show: () => Promise<T>): Promise<T> {
	openOverlays++;
	try {
		return await show();
	} finally {
		openOverlays--;
	}
}
