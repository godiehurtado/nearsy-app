import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { getPalette, Palette, ThemeName } from './colors';
import { loadAppearance, saveAppearance } from './themeStorage';

interface ThemeContextValue {
  theme: ThemeName;
  palette: Palette;
  /** false until the user has explicitly chosen on Theme Selection (first run). */
  hasChosenTheme: boolean;
  /** true while the persisted preference is being read on cold start. */
  hydrating: boolean;
  /** Local persistence. Writes ONLY when the user confirms with Continue. */
  commitTheme: (t: ThemeName) => Promise<void>;
  /** In-memory only — used by Theme Selection for the reversible preview. */
  previewTheme: (t: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({
  children,
  initial = 'dark',
}: {
  children: React.ReactNode;
  initial?: ThemeName;
}) {
  const [theme, setTheme] = useState<ThemeName>(initial);
  const [hasChosenTheme, setHasChosenTheme] = useState(false);
  const [hydrating, setHydrating] = useState(true);

  useEffect(() => {
    let alive = true;
    loadAppearance()
      .then((stored) => {
        if (!alive || !stored) return;
        setTheme(stored);
        setHasChosenTheme(true);
      })
      .finally(() => {
        if (alive) setHydrating(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const previewTheme = useCallback((t: ThemeName) => setTheme(t), []);

  const commitTheme = useCallback(async (t: ThemeName) => {
    setTheme(t);
    setHasChosenTheme(true);
    await saveAppearance(t);
  }, []);

  const value = useMemo(
    () => ({
      theme,
      palette: getPalette(theme),
      hasChosenTheme,
      hydrating,
      commitTheme,
      previewTheme,
    }),
    [theme, hasChosenTheme, hydrating, commitTheme, previewTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useAppTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useAppTheme must be used within ThemeProvider');
  return ctx;
}
