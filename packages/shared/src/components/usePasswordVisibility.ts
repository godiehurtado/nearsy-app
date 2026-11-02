import { useCallback, useState } from 'react';
import type { NativeSyntheticEvent, TextInputSelectionChangeEventData } from 'react-native';

export type TextSelection = { start: number; end: number };

/**
 * Show/hide password without dropping the typed value.
 * iOS remounts the native field when `secureTextEntry` flips; we restore selection.
 */
export function usePasswordVisibility(initiallyHidden = true) {
  const [visible, setVisible] = useState(!initiallyHidden);
  const [selection, setSelection] = useState<TextSelection | undefined>();

  const onSelectionChange = useCallback(
    (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      setSelection(event.nativeEvent.selection);
    },
    [],
  );

  const toggle = useCallback(() => {
    setVisible((prev) => !prev);
  }, []);

  return {
    visible,
    hidden: !visible,
    secureTextEntry: !visible,
    selection,
    onSelectionChange,
    toggle,
  };
}
