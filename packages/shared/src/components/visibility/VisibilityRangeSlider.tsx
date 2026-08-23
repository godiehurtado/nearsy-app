import React, { useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  PanResponder,
  type DimensionValue,
  type LayoutChangeEvent,
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

export function VisibilityRangeSlider(props: Props) {
  const { palette } = useAppTheme();
  const trackWidth = useRef(0);
  const activeThumb = useRef<'low' | 'high' | 'single'>('single');

  const lowValue = props.mode === 'dual' ? props.low : props.value;
  const highValue = props.mode === 'dual' ? props.high : props.max;

  const lowRatio = valueToRatio(lowValue, props.min, props.max);
  const highRatio = valueToRatio(highValue, props.min, props.max);

  const emit = (ratio: number, thumb: 'low' | 'high' | 'single') => {
    const next = ratioToValue(ratio, props.min, props.max, props.step);
    if (props.mode === 'single') {
      props.onChange(next);
      return;
    }
    if (thumb === 'low') {
      props.onChange(Math.min(next, props.high), props.high);
      return;
    }
    props.onChange(props.low, Math.max(next, props.low));
  };

  const emitEnd = () => {
    if (props.mode === 'single') {
      props.onChangeEnd?.(props.value);
      return;
    }
    props.onChangeEnd?.(props.low, props.high);
  };

  const pickThumb = (ratio: number) => {
    if (props.mode === 'single') return 'single';
    const lowDistance = Math.abs(ratio - lowRatio);
    const highDistance = Math.abs(ratio - highRatio);
    return lowDistance <= highDistance ? 'low' : 'high';
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const width = trackWidth.current;
          if (width <= 0) return;
          const x = evt.nativeEvent.locationX;
          const ratio = clampValue(x / width, 0, 1);
          activeThumb.current = pickThumb(ratio);
          emit(ratio, activeThumb.current);
        },
        onPanResponderMove: (evt) => {
          const width = trackWidth.current;
          if (width <= 0) return;
          const x = evt.nativeEvent.locationX;
          const ratio = clampValue(x / width, 0, 1);
          emit(ratio, activeThumb.current);
        },
        onPanResponderRelease: () => emitEnd(),
        onPanResponderTerminate: () => emitEnd(),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.min, props.max, props.step, lowValue, highValue, props.mode],
  );

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
    >
      <View
        style={[styles.track, { backgroundColor: palette.border }]}
        onLayout={onLayout}
        {...panResponder.panHandlers}
      >
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
        {props.mode === 'dual' ? (
          <>
            <View
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
    top: -(THUMB_SIZE - 4) / 2,
  },
});
