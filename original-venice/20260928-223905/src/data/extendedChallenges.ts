import { PRESETS } from "./presets";
export const EXTENDED_CHALLENGES = PRESETS.filter(p => p.id === "vat" || p.id === "outage" || p.id === "leak" || p.id === "rfp");
export function getChallenge(id: string){ return PRESETS.find(p => p.id === id); }
