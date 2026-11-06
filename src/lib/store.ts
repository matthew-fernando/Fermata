import { isTauri } from '@tauri-apps/api/core';
import { Store } from '@tauri-apps/plugin-store';
import { sanitizeState, type TimerState } from './timer';

const STORE_PATH = 'fermata-state.json';
// The web version saves in the browser instead of a file
const WEB_STORAGE_KEY = 'fermata-state';
let store: Store | null = null;

async function getStore(): Promise<Store> {
	if (!store) {
		store = await Store.load(STORE_PATH);
	}
	return store;
}

/**
 * Saves current timer state to local JSON storage.
 */
export async function saveState(state: TimerState): Promise<void> {
	if (!isTauri()) {
		try {
			localStorage.setItem(WEB_STORAGE_KEY, JSON.stringify(state));
		} catch (err) {
			console.warn('Failed to save state in this browser:', err);
		}
		return;
	}
	const s = await getStore();
	await s.set('state', state);
	await s.save();
}

/**
 * Loads saved state from storage and merges it with default state.
 */
export async function loadState(defaultState: TimerState): Promise<TimerState> {
	try {
		let saved: Partial<TimerState> | null | undefined;
		if (isTauri()) {
			saved = await (await getStore()).get<Partial<TimerState>>('state');
		} else {
			saved = JSON.parse(localStorage.getItem(WEB_STORAGE_KEY) ?? 'null');
		}
		if (saved) {
			// Saved state from before the intro existed means this isn't a first launch
			return sanitizeState({ ...defaultState, hasSeenIntro: true, ...saved });
		}
	} catch (err) {
		console.warn('Failed to load saved state, falling back to defaults:', err);
	}
	return defaultState;
}