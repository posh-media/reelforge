import React from 'react';
import { View } from 'react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';

type LogoProps = {
  /** Size in px of the mark. Wordmark text scales relative to this. */
  size?: number;
  /** 'mark' = icon only, 'wordmark' = icon + "Reelforge" text */
  variant?: 'mark' | 'wordmark';
  /** Use the dark mark on a light background instead of amber-on-dark */
  onLight?: boolean;
};

const AMBER = '#E8A33D';
const DARK = '#0B0D14';
const TEXT_LIGHT = '#F2F1ED';

export function Logo({ size = 40, variant = 'mark', onLight = false }: LogoProps) {
  const markFill = onLight ? DARK : AMBER;

  if (variant === 'mark') {
    return (
      <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
        <Path
          d="M28 22 L52 34 L42 40 L76 50 L42 60 L52 66 L28 78 Z"
          fill={markFill}
          strokeLinejoin="round"
        />
      </Svg>
    );
  }

  // Wordmark: mark + text side by side
  const width = size * 3.6;
  const height = size;

  return (
    <View style={{ width, height, flexDirection: 'row', alignItems: 'center' }}>
      <Svg width={width} height={height} viewBox="0 0 360 100" fill="none">
        <Path
          d="M28 22 L52 34 L42 40 L76 50 L42 60 L52 66 L28 78 Z"
          fill={markFill}
          strokeLinejoin="round"
        />
        <SvgText
          x="98"
          y="64"
          fontFamily="SpaceGrotesk_600SemiBold"
          fontSize="42"
          fill={onLight ? DARK : TEXT_LIGHT}
        >
          Reelforge
        </SvgText>
      </Svg>
    </View>
  );
}

export default Logo;
