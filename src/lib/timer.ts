type Mode = "idle" | "working" | "onBreak";

type TrayMode = "icon" | "breakBalance" | "currentPeriod" | "totalSession" | "longBreak";

type Theme = "dark" | "light";

// Which symbol the logo and menu bar show on the way to a long break
type RestStage = "fermata" | "quarter" | "half" | "whole";

interface TimerState {
	mode: Mode;
	workElapsed: number;
	workSinceBreak: number;
	breakBalance: number;
	wasOnBreak: boolean;
	sinceLongBreak: number;
	longBreakEarned: boolean;
	longBreakToCelebrate: boolean;
	longBreakThreshold: number;
	longBreakLength: number;
	ratio: number;
	trayMode: TrayMode;
	theme: Theme;
	alwaysOnTop: boolean;
	hasSeenIntro: boolean;
}

// Used for first launch defaults and the Use Pomodoro Ratio button
const POMODORO_SETTINGS = {
	ratio: 5,
	longBreakThreshold: 100 * 60,
	longBreakLength: 20 * 60
};

const MAX_RATIO = 20;

function tick(state: TimerState): TimerState 
{
	switch (state.mode) {
		case "idle":
		  break;

		case "working":
			state.workElapsed++;
			state.workSinceBreak++;
			state.breakBalance += 1 / state.ratio;
			state.sinceLongBreak++;

			if (state.sinceLongBreak >= state.longBreakThreshold) 
			{
				state.breakBalance += state.longBreakLength;
				state.sinceLongBreak = 0;
				state.longBreakEarned = true;
				state.longBreakToCelebrate = true;
			}
			break;

		case "onBreak":
		  state.breakBalance--;
		  break;
		}

	return state;
}

function startWork(state: TimerState): TimerState
{
	if(state.wasOnBreak)
		state.workSinceBreak = 0;
	state.mode = "working";
	state.wasOnBreak = false;
	return state;
}

function startBreak(state: TimerState): TimerState
{
	state.mode = "onBreak";
	state.wasOnBreak = true;
	state.longBreakEarned = false;
	return state;
}

function startIdle(state: TimerState): TimerState
{
	state.mode = "idle";
	return state;
}

function resetTimers(state: TimerState): TimerState
{
	state.workElapsed = 0;
	state.workSinceBreak = 0;
	state.breakBalance = 0;
	state.sinceLongBreak = 0;
	state.longBreakEarned = false;
	state.longBreakToCelebrate = false;
	state.wasOnBreak = false;
	state.mode = "idle";
	return state;
}

// Whole rest once the long break is earned (until the next break starts),
// otherwise quarter and half rests at 25% and 50% of the way there
function restStage(state: TimerState): RestStage
{
	if (state.longBreakEarned)
		return "whole";
	const progress = state.sinceLongBreak / state.longBreakThreshold;
	if (progress >= 0.5)
		return "half";
	if (progress >= 0.25)
		return "quarter";
	return "fermata";
}

// Repairs values older versions could save: an empty ratio field made the
// balance Infinity, which is stored as null
function sanitizeState(state: TimerState): TimerState
{
	for (const key of ["ratio", "longBreakThreshold", "longBreakLength"] as const) {
		if (!(state[key] > 0) || !Number.isFinite(state[key]))
			state[key] = POMODORO_SETTINGS[key];
	}
	for (const key of ["workElapsed", "workSinceBreak", "breakBalance", "sinceLongBreak"] as const) {
		if (!Number.isFinite(state[key]))
			state[key] = 0;
	}
	return state;
}

export {tick, startWork, startBreak, startIdle, resetTimers, restStage, sanitizeState, POMODORO_SETTINGS, MAX_RATIO}
export type {Mode, TimerState, TrayMode, Theme, RestStage}
