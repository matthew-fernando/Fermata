type Mode = "idle" | "working" | "onBreak";

type TrayMode = "icon" | "breakBalance" | "currentPeriod" | "totalSession" | "longBreak";

type Theme = "dark" | "light";

// Which symbol the break button and menu bar show on the way to a long break
type RestStage = "fermata" | "quarter" | "half" | "whole";

interface TimerState {
	mode: Mode;
	workElapsed: number;
	workSinceBreak: number;
	breakBalance: number;
	wasOnBreak: boolean;
	sinceLongBreak: number;
	longBreakEarned: boolean;
	longBreakThreshold: number;
	longBreakLength: number;
	ratio: number;
	trayMode: TrayMode;
	theme: Theme;
}

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

export {tick, startWork, startBreak, startIdle, resetTimers, restStage}
export type {Mode, TimerState, TrayMode, Theme, RestStage}
