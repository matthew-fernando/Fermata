import { Store } from '@tauri-apps/plugin-store';
import type { TimerState } from './timer';

const STORE_PATH = 'fermata-state.json';
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
	const s = await getStore();
	await s.set('state', state);
	await s.save();
}

/**
 * Loads saved state from storage and merges it with default state.
 */
export async function loadState(defaultState: TimerState): Promise<TimerState> {
	try {
		const s = await getStore();
		const saved = await s.get<TimerState>('state');
		if (saved) {
			return { ...defaultState, ...saved };
		}
	} catch (err) {
		console.warn('Failed to load saved state, falling back to defaults:', err);
	}
	return defaultState;
}