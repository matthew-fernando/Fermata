type Mode = "idle" | "working" | "onBreak";

type TrayMode = "icon" | "breakBalance" | "currentPeriod" | "totalSession" | "longBreak";

interface TimerState {
	mode: Mode;
	workElapsed: number;
	workSinceBreak: number;
	breakBalance: number;
	wasOnBreak: boolean;
	sinceLongBreak: number;
	longBreakThreshold: number;
	longBreakLength: number;
	ratio: number;
	trayMode: TrayMode;
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
	return state;
}

function startIdle(state: TimerState): TimerState
{
	state.mode = "idle";
	return state;
}

export {tick, startWork, startBreak, startIdle}
export type {Mode, TimerState, TrayMode}
