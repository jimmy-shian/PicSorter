import Svg, { Circle, Line, Path, Polyline } from 'react-native-svg';

export type ArrowDirection = 'up' | 'down' | 'left' | 'right' | 'up-left' | 'up-right';

interface CircleIconProps {
  size?: number;
  color?: string;
}

/**
 * 圓圈粗箭頭：與使用者指定的參考圖同風格（圓框＋圓頭粗箭頭）。
 * 向量繪製，在任何密度下都清晰，不用文字箭頭字元。
 */
export function ArrowCircle({
  direction,
  size = 28,
  color = '#000',
}: CircleIconProps & { direction: ArrowDirection }) {
  const circleStroke = Math.max(2, size * 0.075);
  const arrowStroke = Math.max(2.5, size * 0.115);
  const common = {
    stroke: color,
    strokeWidth: arrowStroke,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };

  let arrow: React.ReactNode = null;
  if (direction === 'up') {
    arrow = (
      <>
        <Line x1="24" y1="33" x2="24" y2="15" {...common} />
        <Polyline points="16,23 24,15 32,23" {...common} />
      </>
    );
  } else if (direction === 'down') {
    arrow = (
      <>
        <Line x1="24" y1="15" x2="24" y2="33" {...common} />
        <Polyline points="16,25 24,33 32,25" {...common} />
      </>
    );
  } else if (direction === 'left') {
    arrow = (
      <>
        <Line x1="33" y1="24" x2="15" y2="24" {...common} />
        <Polyline points="23,16 15,24 23,32" {...common} />
      </>
    );
  } else if (direction === 'right') {
    arrow = (
      <>
        <Line x1="15" y1="24" x2="33" y2="24" {...common} />
        <Polyline points="25,16 33,24 25,32" {...common} />
      </>
    );
  } else if (direction === 'up-left') {
    arrow = (
      <>
        <Line x1="32" y1="32" x2="18" y2="18" {...common} />
        <Polyline points="18,28 18,18 28,18" {...common} />
      </>
    );
  } else {
    arrow = (
      <>
        <Line x1="16" y1="32" x2="30" y2="18" {...common} />
        <Polyline points="20,18 30,18 30,28" {...common} />
      </>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Circle cx="24" cy="24" r="19" stroke={color} strokeWidth={circleStroke} fill="none" />
      {arrow}
    </Svg>
  );
}

/** 放大：同風格圓框＋雙向展開斜箭頭（雙指撐開的手勢語意）。 */
export function ExpandCircle({ size = 28, color = '#000' }: CircleIconProps) {
  const circleStroke = Math.max(2, size * 0.075);
  const arrowStroke = Math.max(2.5, size * 0.115);
  const common = {
    stroke: color,
    strokeWidth: arrowStroke,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Circle cx="24" cy="24" r="19" stroke={color} strokeWidth={circleStroke} fill="none" />
      <Line x1="17" y1="31" x2="31" y2="17" {...common} />
      <Polyline points="23,17 31,17 31,25" {...common} />
      <Polyline points="25,31 17,31 17,23" {...common} />
    </Svg>
  );
}

/** 撤銷：流暢逆時針弧線箭頭 */
export function UndoIcon({ size = 16, color = '#000' }: CircleIconProps) {
  const w = Math.max(2, size * 0.125);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 14L4 9L9 4"
        stroke={color}
        strokeWidth={w}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M4 9H14.5C17.5 9 20 11.5 20 14.5C20 17.5 17.5 20 14.5 20H11"
        stroke={color}
        strokeWidth={w}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** 設定齒輪：圓心＋8 齒，線條圖不依賴字型。 */
export function GearIcon({ size = 22, color = '#000' }: CircleIconProps) {
  const spokes: number[] = [0, 45, 90, 135, 180, 225, 270, 315];
  const rad = (d: number) => (d * Math.PI) / 180;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {spokes.map((d) => (
        <Line
          key={d}
          x1={12 + 7.2 * Math.cos(rad(d))}
          y1={12 + 7.2 * Math.sin(rad(d))}
          x2={12 + 9.6 * Math.cos(rad(d))}
          y2={12 + 9.6 * Math.sin(rad(d))}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
        />
      ))}
      <Circle cx="12" cy="12" r="6.4" stroke={color} strokeWidth={2} fill="none" />
      <Circle cx="12" cy="12" r="2" fill={color} />
    </Svg>
  );
}

/** 小 chevron（展開 / 更換 / 下拉用），取代 ▲ › ▼ 文字字元。 */
export function Chevron({ size = 12, color = '#000', direction = 'up' }: CircleIconProps & { direction?: 'up' | 'right' | 'down' }) {
  const pts = direction === 'up' ? '4,10 8,6 12,10' : direction === 'right' ? '6,4 10,8 6,12' : '4,6 8,10 12,6';
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      <Polyline
        points={pts}
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/** 資訊圖示：圓圈 + i */
export function InfoIcon({ size = 18, color = '#000' }: CircleIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9.5" stroke={color} strokeWidth={1.8} fill="none" />
      <Circle cx="12" cy="7.5" r="1.2" fill={color} />
      <Line x1="12" y1="11" x2="12" y2="17" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
