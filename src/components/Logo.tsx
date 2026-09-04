import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../theme/colors';

type LogoProps = {
  /** Size in px of the mark. Wordmark text scales relative to this. */
  size?: number;
  /** 'mark' = icon only, 'wordmark' = icon + "Reelforge" text */
  variant?: 'mark' | 'wordmark';
  /** Use the dark mark on a light background instead of amber-on-dark */
  onLight?: boolean;
};

export function Logo({ size = 40, variant = 'mark', onLight = false }: LogoProps) {
  const markFill = onLight ? colors.background : colors.accentAmber;
  const textColor = onLight ? colors.background : colors.textPrimary;

  const mark = (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <Path
        d="M28 22 L52 34 L42 40 L76 50 L42 60 L52 66 L28 78 Z"
        fill={markFill}
        strokeLinejoin="round"
      />
    </Svg>
  );

  if (variant === 'mark') {
    return mark;
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: size }}>
      {mark}
      <Text
        style={{
          marginLeft: size * 0.2,
          fontFamily: 'SpaceGrotesk_600SemiBold',
          fontSize: size * 0.52,
          color: textColor,
          lineHeight: size * 0.65,
        }}
      >
        Reelforge
      </Text>
    </View>
  );
}

export default Logo;
