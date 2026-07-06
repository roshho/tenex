import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { colors } from '../constants/theme';

interface Props {
  size?: number;
}

const DOT = 10;
const DOT_SMALL = 7;

// Soft concentric "aura" motif — the app's one recurring decorative element, used behind
// headline copy on the Landing screen and behind the Camera permission state. Self-contained
// and self-animating (entrance fade/scale-in, a slow breathing pulse, two dots orbiting at
// different speeds) so both call sites get the same motion for free. Built entirely on RN's
// core Animated API — no animation/gradient dependency is installed in this project.
export default function AuraRings({ size = 220 }: Props) {
  const outer = size;
  const mid = size * 0.68;
  const core = size * 0.38;

  const entrance = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const orbitA = useRef(new Animated.Value(0)).current;
  const orbitB = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.timing(orbitA, { toValue: 1, duration: 26000, easing: Easing.linear, useNativeDriver: true })
    ).start();

    Animated.loop(
      Animated.timing(orbitB, { toValue: 1, duration: 19000, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, [breathe, entrance, orbitA, orbitB]);

  const scale = entrance.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });
  const breatheScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const spinA = orbitA.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const spinB = orbitB.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });

  return (
    <Animated.View
      style={[styles.wrap, { width: outer, height: outer, opacity: entrance, transform: [{ scale }] }]}
      pointerEvents="none"
    >
      <Animated.View
        style={[
          styles.ring,
          { width: outer, height: outer, borderRadius: outer / 2, backgroundColor: colors.primarySurface, transform: [{ scale: breatheScale }] },
        ]}
      />
      <Animated.View
        style={[
          styles.ring,
          { width: mid, height: mid, borderRadius: mid / 2, backgroundColor: colors.accentSurface, transform: [{ scale: breatheScale }] },
        ]}
      />
      <View style={[styles.ring, { width: core, height: core, borderRadius: core / 2, backgroundColor: colors.primaryLight }]} />

      <Animated.View style={[styles.orbit, { width: outer, height: outer, transform: [{ rotate: spinA }] }]}>
        <View style={[styles.dot, { backgroundColor: colors.primary, top: -DOT / 2, marginLeft: -DOT / 2 }]} />
      </Animated.View>
      <Animated.View
        style={[
          styles.orbit,
          { width: mid, height: mid, top: (outer - mid) / 2, left: (outer - mid) / 2, transform: [{ rotate: spinB }] },
        ]}
      >
        <View style={[styles.dotSmall, { backgroundColor: colors.accent, top: -DOT_SMALL / 2, marginLeft: -DOT_SMALL / 2 }]} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
  },
  orbit: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  dot: {
    position: 'absolute',
    left: '50%',
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
  },
  dotSmall: {
    position: 'absolute',
    left: '50%',
    width: DOT_SMALL,
    height: DOT_SMALL,
    borderRadius: DOT_SMALL / 2,
  },
});
