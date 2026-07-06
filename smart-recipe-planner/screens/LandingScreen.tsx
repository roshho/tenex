import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import VideoBackground from '../components/VideoBackground';
import { colors, spacing, radius, typography } from '../constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Landing'>;
};

// Fades + rises a block into place after `delay` — used to stagger the headline block
// and CTA into a single cascading reveal on mount rather than popping in at once.
function useRevealAnim(delay: number) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(value, {
      toValue: 1,
      duration: 600,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [value, delay]);
  return { opacity: value, transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] };
}

export default function LandingScreen({ navigation }: Props) {
  const copyAnim = useRevealAnim(0);
  const ctaAnim = useRevealAnim(150);

  const pressScale = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Ambient, continuous — a slow breathing glow behind the CTA, looped for as long
    // as the screen is mounted.
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(glow, { toValue: 0, duration: 1700, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ])
    ).start();
  }, [glow]);

  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.4] });

  const handlePressIn = () => {
    Animated.spring(pressScale, { toValue: 0.97, useNativeDriver: true, speed: 40, bounciness: 4 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(pressScale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  };

  return (
    <View style={styles.root}>
      <VideoBackground />
      <View style={styles.scrim} pointerEvents="none" />

      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <Animated.View style={copyAnim}>
            <Text style={styles.eyebrow}>Smart Recipe Planner</Text>
            <Text style={styles.headline}>Turn your leftovers into a gourmet meal</Text>
            <Text style={styles.subhead}>
              Snap a photo of your ingredients and get chef-crafted recipes in seconds.
            </Text>
          </Animated.View>

          <Animated.View style={[ctaAnim, styles.ctaSpacing]}>
            <View style={styles.ctaWrap}>
              <Animated.View
                style={[
                  styles.ctaShadowWrap,
                  { transform: [{ scale: pressScale }], shadowOpacity: glowOpacity },
                ]}
              >
                <TouchableOpacity
                  style={styles.cta}
                  onPress={() => navigation.navigate('Camera')}
                  onPressIn={handlePressIn}
                  onPressOut={handlePressOut}
                  activeOpacity={0.92}
                >
                  <Text style={styles.ctaText}>Scan Your Ingredients</Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
          </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.text,
  },
  // Flat (not gradient) darkening over the video so headline/CTA stay legible
  // regardless of what's playing behind them — see VideoBackground's own note on why
  // this project isn't using a gradient overlay.
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.scrimStrong,
  },
  safe: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'flex-end',
  },
  eyebrow: {
    ...typography.eyebrow,
    color: colors.primaryLight,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  headline: {
    ...typography.h1,
    fontSize: 33,
    lineHeight: 40,
    letterSpacing: -0.5,
    color: colors.white,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  subhead: {
    ...typography.body,
    color: 'rgba(255,255,255,0.78)',
    textAlign: 'center',
    maxWidth: 320,
    marginTop: spacing.sm,
    alignSelf: 'center',
  },
  ctaSpacing: {
    marginTop: spacing.xl,
  },
  ctaWrap: {
    position: 'relative',
  },
  ctaShadowWrap: {
    borderRadius: radius.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    elevation: 8,
  },
  cta: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md + 2,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  ctaText: {
    ...typography.body,
    color: colors.white,
    fontWeight: '700',
  },
});
