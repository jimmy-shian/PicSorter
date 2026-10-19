import { useEffect, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

interface Props {
  text: string;
  style?: StyleProp<TextStyle>;
  boxStyle?: StyleProp<ViewStyle>;
  speed?: number;
  pauseMs?: number;
  /** 是否啟用跑馬燈動畫。若為 false，文字超出時僅以省略號呈現不滾動 */
  active?: boolean;
}

/** Fixed-height, clipped label. Long names scroll without replacing the measured text node. */
export function MarqueeText({ text, style, boxStyle, speed = 28, pauseMs = 900, active = true }: Props) {
  const [boxWidth, setBoxWidth] = useState(0);
  const [measurement, setMeasurement] = useState({ text: '', width: 0 });
  const [translateX] = useState(() => new Animated.Value(0));
  const textWidth = measurement.text === text ? measurement.width : 0;
  const overflow = boxWidth > 0 && textWidth > boxWidth;
  const shouldAnimate = active && overflow;

  useEffect(() => {
    translateX.stopAnimation();
    translateX.setValue(0);
    if (!shouldAnimate) return;

    const distance = textWidth - boxWidth + 8;
    const duration = Math.max(900, Math.round((distance / speed) * 1000));
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(pauseMs),
        Animated.timing(translateX, {
          toValue: -distance,
          duration,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.delay(pauseMs),
        Animated.timing(translateX, {
          toValue: 0,
          duration,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
  }, [boxWidth, pauseMs, shouldAnimate, speed, text, textWidth, translateX]);

  return (
    <View
      style={[styles.box, boxStyle]}
      onLayout={(event) => {
        const width = event.nativeEvent.layout.width;
        setBoxWidth((current) => (current === width ? current : width));
      }}>
      <Text
        accessible={false}
        style={[style, styles.measureText]}
        onLayout={(event) => {
          const width = event.nativeEvent.layout.width;
          setMeasurement((current) =>
            current.text === text && current.width === width ? current : { text, width },
          );
        }}>
        {text}
      </Text>
      <Text
        numberOfLines={1}
        ellipsizeMode={shouldAnimate ? 'clip' : 'tail'}
        style={[style, styles.placeholder, shouldAnimate ? styles.hidden : null]}
        accessibilityLabel={text}>
        {text}
      </Text>
      {shouldAnimate ? (
        <Animated.View pointerEvents="none" style={[styles.runner, { transform: [{ translateX }] }]}>
          <Text numberOfLines={1} ellipsizeMode="clip" style={[style, styles.runnerText]}>
            {text}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', justifyContent: 'center' },
  placeholder: { opacity: 1 },
  hidden: { opacity: 0 },
  runner: { position: 'absolute', left: 0, top: 0, bottom: 0, alignSelf: 'flex-start', flexDirection: 'row' },
  runnerText: { flexShrink: 0, textAlign: 'left' },
  // 移到裁切區以外量測自然寬度，不能讓格子寬度截斷成「…」後再量。
  measureText: { position: 'absolute', left: -10000, top: 0, opacity: 0, alignSelf: 'flex-start', textAlign: 'left' },
});
