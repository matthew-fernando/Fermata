/**
 * Formats a duration in seconds into MM:SS or H:MM:SS.
 * Always rounds down to the nearest whole second and prevents `-00:00`.
 */
export function formatTime(seconds: number): string {
	const absSeconds = Math.floor(Math.abs(seconds));
	
	// Only show negative sign if we actually have at least 1 second of debt to display
	const isNegative = seconds < 0 && absSeconds > 0;

	const hrs = Math.floor(absSeconds / 3600);
	const mins = Math.floor((absSeconds % 3600) / 60);
	const secs = absSeconds % 60;

	const pad = (n: number) => n.toString().padStart(2, '0');

	let formatted = `${pad(mins)}:${pad(secs)}`;
	if (hrs > 0) {
		formatted = `${hrs}:${formatted}`;
	}

	return isNegative ? `-${formatted}` : formatted;
}