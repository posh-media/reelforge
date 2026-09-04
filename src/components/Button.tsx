import React from 'react';
import { Pressable, Text, ViewStyle } from 'react-native';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  className?: string;
  textClassName?: string;
}

const variantStyles: Record<ButtonVariant, { base: string; text: string }> = {
  primary: {
    base: 'bg-accentAmber rounded-lg px-5 py-3 items-center justify-center',
    text: 'text-background font-body-semibold',
  },
  secondary: {
    base: 'bg-accentViolet rounded-lg px-5 py-3 items-center justify-center',
    text: 'text-textPrimary font-body-semibold',
  },
  outline: {
    base: 'border border-accentViolet rounded-lg px-5 py-3 items-center justify-center',
    text: 'text-accentViolet font-body-semibold',
  },
  danger: {
    base: 'border border-statusError rounded-lg px-5 py-3 items-center justify-center',
    text: 'text-statusError font-body-semibold',
  },
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  className = '',
  textClassName = '',
}: ButtonProps) {
  const styles = variantStyles[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={[styles.base, disabled ? 'opacity-50' : 'opacity-100', className].join(' ')}
      style={({ pressed }): ViewStyle | undefined => {
        if (disabled) return undefined;
        return pressed
          ? { transform: [{ scale: 0.98 }], opacity: 0.85 }
          : { transform: [{ scale: 1 }], opacity: 1 };
      }}
    >
      <Text className={[styles.text, textClassName].join(' ')}>{title}</Text>
    </Pressable>
  );
}

export default Button;
