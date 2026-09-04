// src/components/DateField.jsx
// Native date / datetime-local input that reliably opens its calendar when the
// box is clicked (not only the icon) via showPicker(), and inherits the theme's
// color-scheme so the icon + popup are visible in dark mode. No dependencies.

import { S } from '../lib/styles.js';

export default function DateField({ type = 'date', style, onFocus, onClick, ...rest }) {
  // showPicker() throws if unsupported or called without user activation — both
  // are non-fatal (the field still works), so swallow it.
  const openPicker = e => {
    try {
      e.currentTarget.showPicker?.();
    } catch {
      /* not user-activated / unsupported — the native icon still works */
    }
  };
  return (
    <input
      type={type}
      style={{ ...S.input, colorScheme: 'inherit', ...style }}
      onClick={e => {
        openPicker(e);
        onClick?.(e);
      }}
      onFocus={e => {
        openPicker(e);
        onFocus?.(e);
      }}
      {...rest}
    />
  );
}
