import type { RestStage } from './timer';

// The web version's stand-in for the menu bar: time in the tab title, rest symbol as the tab icon
const STAGE_SHAPES: Record<RestStage, string> = {
	fermata: '<path d="M2 17 A10 10 0 0 1 22 17 L20.4 17 A8.4 7.6 0 0 0 3.6 17 Z"/><circle cx="12" cy="15.2" r="1.7"/>',
	quarter: '<path d="M10.3 3 L14.9 8.3 C13.4 9.6 12.6 11 13.1 12.7 L15.6 16.4 C13.4 15.6 11.1 16 10.9 18 C10.8 19.4 11.7 20.6 12.9 21.6 C10.5 21 8.8 19.5 9 17.4 C9.2 15.6 10.8 14.6 12.4 14.7 L9.2 10.6 C10.8 9.3 11.6 8 11.6 6.4 Z"/>',
	half: '<rect x="3.5" y="13.2" width="17" height="1.5" rx="0.4"/><rect x="7" y="8.4" width="10" height="5" rx="0.4"/>',
	whole: '<rect x="3.5" y="9.3" width="17" height="1.5" rx="0.4"/><rect x="7" y="10.6" width="10" height="5" rx="0.4"/>'
};

let lastStage: RestStage | null = null;

export function updateBrowserTab(time: string, stage: RestStage): void {
	document.title = `${time} · Fermata`;
	if (stage === lastStage) return;
	lastStage = stage;

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><style>*{fill:#111}@media (prefers-color-scheme:dark){*{fill:#f4f4f2}}</style>${STAGE_SHAPES[stage]}</svg>`;
	const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
	if (icon) icon.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
