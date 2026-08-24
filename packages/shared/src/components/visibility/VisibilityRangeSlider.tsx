import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  PanResponder,
  type DimensionValue,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PanResponderGestureState,
} from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { radius } from '../../theme/radius';
import {
  clampValue,
  ratioToValue,
  valueToRatio,
} from '../../visibility/sliderMath';

type BaseProps = {
  min: number;
  max: number;
  step: number;
  accessibilityLabel: string;
  onDragStateChange?: (dragging: boolean) => void;
};

type SingleProps = BaseProps & {
  mode: 'single';
  value: number;
  onChange: (value: number) => void;
  onChangeEnd?: (value: number) => void;
};

type DualProps = BaseProps & {
  mode: 'dual';
  low: number;
  high: number;
  onChange: (low: number, high: number) => void;
  onChangeEnd?: (low: number, high: number) => void;
};

type Props = SingleProps | DualProps;

const THUMB_SIZE = 22;
const HIT_SLOP = 18;

type DualLocal = { low: number; high: number };

export function VisibilityRangeSlider(props: Props) {
  const { palette } = useAppTheme();
  const trackWidth = useRef(0);
  const activeThumb = useRef<'low' | 'high' | 'single'>('single');
  const propsRef = useRef(props);
  propsRef.current = props;

  const [dragging, setDragging] = useState(false);
  const [localSingle, setLocalSingle] = useState<number | null>(null);
  const [localDual, setLocalDual] = useState<DualLocal | null>(null);

  // Sync local visual state from props when not dragging.
  useEffect(() => {
    if (dragging) return;
    setLocalSingle(null);
    setLocalDual(null);
  }, [
    dragging,
    props.mode,
    props.mode === 'single' ? props.value : props.low,
    props.mode === 'dual' ? props.high : 0,
  ]);

  const lowValue =
    props.mode === 'dual'
      ? (localDual?.low ?? props.low)
      : (localSingle ?? props.value);
  const highValue =
    props.mode === 'dual' ? (localDual?.high ?? props.high) : props.max;

  const lowRatio = valueToRatio(lowValue, props.min, props.max);
  const highRatio = valueToRatio(highValue, props.min, props.max);

  const setDraggingState = (next: boolean) => {
    setDragging(next);
    propsRef.current.onDragStateChange?.(next);
  };

  const emitLive = (ratio: number, thumb: 'low' | 'high' | 'single') => {
    const p = propsRef.current;
    const next = ratioToValue(ratio, p.min, p.max, p.step);
    if (p.mode === 'single') {
      localSingleRef.current = next;
      setLocalSingle(next);
      p.onChange(next);
      return;
    }
    const current = localDualRef.current ?? { low: p.low, high: p.high };
    if (thumb === 'low') {
      const low = Math.min(next, current.high);
      const dual = { low, high: current.high };
      localDualRef.current = dual;
      setLocalDual(dual);
      p.onChange(dual.low, dual.high);
      return;
    }
    const high = Math.max(next, current.low);
    const dual = { low: current.low, high };
    localDualRef.current = dual;
    setLocalDual(dual);
    p.onChange(dual.low, dual.high);
  };

  const emitEnd = () => {
    const p = propsRef.current;
    setDraggingState(false);
    if (p.mode === 'single') {
      const value = localSingleRef.current ?? p.value;
      setLocalSingle(null);
      p.onChangeEnd?.(value);
      return;
    }
    const dual = localDualRef.current;
    const low = dual?.low ?? p.low;
    const high = dual?.high ?? p.high;
    setLocalDual(null);
    p.onChangeEnd?.(low, high);
  };

  const localSingleRef = useRef<number | null>(null);
  const localDualRef = useRef<DualLocal | null>(null);
  localSingleRef.current = localSingle;
  localDualRef.current = localDual;

  const pickThumb = (ratio: number) => {
    const p = propsRef.current;
    if (p.mode === 'single') return 'single' as const;
    const lowR = valueToRatio(
      localDualRef.current?.low ?? p.low,
      p.min,
      p.max,
    );
    const highR = valueToRatio(
      localDualRef.current?.high ?? p.high,
      p.min,
      p.max,
    );
    return Math.abs(ratio - lowR) <= Math.abs(ratio - highR) ? 'low' : 'high';
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: (
        _e: GestureResponderEvent,
        gesture: PanResponderGestureState,
      ) => Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        const width = trackWidth.current;
        if (width <= 0) return;
        setDraggingState(true);
        const x = evt.nativeEvent.locationX;
        const ratio = clampValue(x / width, 0, 1);
        activeThumb.current = pickThumb(ratio);
        emitLive(ratio, activeThumb.current);
      },
      onPanResponderMove: (evt) => {
        const width = trackWidth.current;
        if (width <= 0) return;
        const x = evt.nativeEvent.locationX;
        const ratio = clampValue(x / width, 0, 1);
        emitLive(ratio, activeThumb.current);
      },
      onPanResponderRelease: () => emitEnd(),
      onPanResponderTerminate: () => emitEnd(),
    }),
  ).current;

  const onLayout = (event: LayoutChangeEvent) => {
    trackWidth.current = event.nativeEvent.layout.width;
  };

  const fillLeft: DimensionValue =
    props.mode === 'single' ? '0%' : `${lowRatio * 100}%`;
  const fillWidth: DimensionValue =
    props.mode === 'single'
      ? `${lowRatio * 100}%`
      : `${Math.max((highRatio - lowRatio) * 100, 0)}%`;
  const lowThumbLeft: DimensionValue = `${lowRatio * 100}%`;
  const highThumbLeft: DimensionValue = `${highRatio * 100}%`;

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={props.accessibilityLabel}
      style={styles.wrap}
      collapsable={false}
    >
      <View
        style={[styles.hitArea, { height: THUMB_SIZE + HIT_SLOP }]}
        onLayout={onLayout}
        {...panResponder.panHandlers}
      >
        <View style={[styles.track, { backgroundColor: palette.border }]}>
          <View
            style={[
              styles.fill,
              {
                left: fillLeft,
                width: fillWidth,
                backgroundColor: palette.primary,
              },
            ]}
          />
        </View>
        {props.mode === 'dual' ? (
          <>
            <View
              pointerEvents="none"
              style={[
                styles.thumb,
                {
                  left: lowThumbLeft,
                  marginLeft: -THUMB_SIZE / 2,
                  backgroundColor: palette.surface,
                  borderColor: palette.primary,
                },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.thumb,
                {
                  left: highThumbLeft,
                  marginLeft: -THUMB_SIZE / 2,
                  backgroundColor: palette.surface,
                  borderColor: palette.primary,
                },
              ]}
            />
          </>
        ) : (
          <View
            pointerEvents="none"
            style={[
              styles.thumb,
              {
                left: lowThumbLeft,
                marginLeft: -THUMB_SIZE / 2,
                backgroundColor: palette.surface,
                borderColor: palette.primary,
              },
            ]}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 12,
  },
  hitArea: {
    justifyContent: 'center',
  },
  track: {
    height: 4,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: radius.pill,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    borderWidth: 2,
    top: HIT_SLOP / 2,
  },
});
