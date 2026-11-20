import React, { useState } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'dark' | 'light';
const STORAGE_KEY = 'studioflow-theme';

// index.html applies the saved theme before first paint; this reads it back.
function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f9f5ec' : '#060505');
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode or blocked storage: the choice lasts for this page only.
  }
}

/** Night / Day switch. Each device remembers its own choice. */
export const ThemeToggle: React.FC = () => {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const isLight = theme === 'light';

  const toggle = () => {
    const next: Theme = isLight ? 'dark' : 'light';
    applyTheme(next);
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={isLight}
      aria-label={isLight ? 'Switch to night theme' : 'Switch to day theme'}
      title={isLight ? 'Night mode' : 'Day mode'}
      className="group relative flex h-9 w-[4.5rem] shrink-0 items-center rounded-full border border-gold/50 bg-obsidian-2 p-1 cursor-pointer transition-colors hover:border-gold focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-2"
    >
      <span
        aria-hidden="true"
        className={`absolute top-1 left-1 size-7 rounded-full bg-gradient-to-br from-gold-bright via-gold to-gold-deep shadow-[0_0_14px_rgb(212_175_55/0.55)] transition-transform duration-300 ease-out ${
          isLight ? 'translate-x-[2.25rem]' : 'translate-x-0'
        }`}
      />
      <Moon aria-hidden="true" className={`relative z-10 ml-1.5 size-4 transition-colors ${isLight ? 'text-gold-soft' : 'text-on-gold'}`} />
      <Sun aria-hidden="true" className={`relative z-10 ml-auto mr-1.5 size-4 transition-colors ${isLight ? 'text-on-gold' : 'text-gold-soft'}`} />
    </button>
  );
};
