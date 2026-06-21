// Shared radius-slider constants and helpers (kept out of the component file
// so it only exports components, as react-refresh requires).

export const MIN_KM = 1;
export const MAX_KM = 500;

export function clamp(v: number, min = MIN_KM, max = MAX_KM) {
    return Math.min(max, Math.max(min, v));
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';
