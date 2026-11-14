/**
 * Height of the software keyboard while it is shown, 0 otherwise.
 * iOS uses the "will" events so layout moves with the keyboard.
 */
import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

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
