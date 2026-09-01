import { createToolWaitingTrigger } from "./tool-wait.ts";

export const piPlannotatorTrigger = createToolWaitingTrigger(
	"pi-plannotator",
	"plannotator_submit_plan",
);
