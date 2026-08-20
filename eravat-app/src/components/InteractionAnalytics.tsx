import { useEffect } from 'react';
import { trackClick, trackFilter } from '../lib/analytics';

const SENSITIVE_SELECTOR = [
  'input[type="password"]',
  'input[name*="pin" i]',
  'input[name*="otp" i]',
  'input[autocomplete="one-time-code"]',
  '.ph-no-autocapture',
  '[data-ph-no-autocapture]',
].join(',');

/**
 * App-wide delegated tracking via data attributes:
 * - data-ph-action="nav.map" on buttons/links → ui.click
 * - data-ph-filter="map.division" on select/input/checkbox → ui.filter_changed
 * Optional: data-ph-screen, data-ph-value-mode="presence" (emits set|cleared instead of raw value)
 */
export function InteractionAnalytics() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const el = target.closest('[data-ph-action]') as HTMLElement | null;
      if (!el || el.matches(SENSITIVE_SELECTOR) || el.closest(SENSITIVE_SELECTOR)) return;
      const action = el.getAttribute('data-ph-action')?.trim();
      if (!action) return;
      const screen = el.getAttribute('data-ph-screen')?.trim();
      trackClick(action, screen ? { screen } : undefined);
    };

    const onChange = (event: Event) => {
      const el = event.target;
      if (!(el instanceof HTMLElement) || !el.hasAttribute('data-ph-filter')) return;
      if (el.matches(SENSITIVE_SELECTOR) || el.closest(SENSITIVE_SELECTOR)) return;
      const filter = el.getAttribute('data-ph-filter')?.trim();
      if (!filter) return;

      let raw = '';
      if (el instanceof HTMLInputElement && el.type === 'checkbox') {
        raw = el.checked ? 'true' : 'false';
      } else if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLSelectElement ||
        el instanceof HTMLTextAreaElement
      ) {
        raw = el.value;
      } else {
        return;
      }

      const mode = el.getAttribute('data-ph-value-mode');
      const value =
        mode === 'presence' ? (raw ? 'set' : 'cleared') : raw.slice(0, 80);
      const screen = el.getAttribute('data-ph-screen')?.trim();
      trackFilter(filter, value, screen ? { screen } : undefined);
    };

    document.addEventListener('click', onClick, true);
    document.addEventListener('change', onChange, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('change', onChange, true);
    };
  }, []);

  return null;
}
