/**
 * Keeps a search field and its results above the keyboard (QA 2.1.0 item 4:
 * in CRJ the keyboard covered Languages). The app draws edge to edge on
 * Android, so the window is not guaranteed to shrink: the scroll content gets
 * extra bottom room while the keyboard is open, and the focused field is
 * scrolled to just under the top of the visible area, leaving its results
 * (at most RESULTS_MAX_HEIGHT) between the field and the keyboard.
 */
import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export const RESULTS_MAX_HEIGHT = 220;
export const REVEAL_TOP_MARGIN = 24;

/** Scroll offset that puts a field `fieldY` (in content coordinates) near the top. */
export function revealScrollY(fieldY: number, margin: number = REVEAL_TOP_MARGIN): number {
  if (!Number.isFinite(fieldY)) return 0;
  return Math.max(0, Math.round(fieldY - margin));
}

/**
 * Bottom room so the content can scroll that far with the keyboard open: the
 * keyboard plus the results list. None while the keyboard is closed.
 */
export function keyboardRevealPadding(
  keyboardHeight: number,
  resultsHeight: number = RESULTS_MAX_HEIGHT,
): number {
  if (!Number.isFinite(keyboardHeight) || keyboardHeight <= 0) return 0;
  return Math.round(keyboardHeight + Math.max(0, resultsHeight));
}

/** Current keyboard height (0 when hidden). */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const shown = Keyboard.addListener(showEvent, (e) => {
      setHeight(Math.max(0, e?.endCoordinates?.height ?? 0));
    });
    const hidden = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  return height;
}
