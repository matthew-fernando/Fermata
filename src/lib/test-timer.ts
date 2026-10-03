import {tick, startWork, startBreak, startIdle} from "./timer.ts";
import type {Mode, TimerState} from "./timer.ts";

const state: TimerState = {
	mode: "idle",
	workElapsed: 0,
	workSinceBreak: 0,
	breakBalance: 0,
	wasOnBreak: false,
	sinceLongBreak: 0,
	longBreakThreshold: 120,
	longBreakLength: 30,
	ratio: 5,
}

startWork(state);

for(let i: number = 0; i < 55; i++)
{
	if(i%10 == 0)
	{
		console.log(`
			workElapsed: ${state.workElapsed};
			workSinceBreak: ${state.workSinceBreak};
			breakBalance: ${state.breakBalance};
			sinceLongBreak: ${state.sinceLongBreak};
		`)
	}

	tick(state);
}


startBreak(state);
console.log("================== STARTING BREAK ==================")

for(let i: number = 0; i < 25; i++)
{
	if(i%10 == 0)
	{
		console.log(`
			workElapsed: ${state.workElapsed};
			workSinceBreak: ${state.workSinceBreak};
			breakBalance: ${state.breakBalance};
			sinceLongBreak: ${state.sinceLongBreak};
		`)
	}

	tick(state);
}




