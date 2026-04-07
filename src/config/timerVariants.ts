// Timer variant configuration for FocusForest
// These are the available Pomodoro timer presets

export interface TimerVariant {
  id: string;
  label: string;
  focusMinutes: number;
}

export const TIMER_VARIANTS: TimerVariant[] = [
  { id: "classic", label: "Classic", focusMinutes: 25 },
  { id: "sprint", label: "Sprint", focusMinutes: 10 },
  { id: "deep", label: "Deep Work", focusMinutes: 45 },
  { id: "ultra", label: "Ultra", focusMinutes: 90 },
];

export const VALID_VARIANT_IDS = TIMER_VARIANTS.map((v) => v.id);
