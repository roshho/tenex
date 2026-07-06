import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

const videoSource = require('../assets/landing-background.mp4');

export default function VideoBackground() {
  const player = useVideoPlayer(videoSource, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  // expo-video's web shim mounts the <video> element after this player is created, so the
  // play() call above (needed for native) fires before there's anything to play — the web
  // <video> stays paused on its first frame. Re-issuing play() post-mount fixes web; it's a
  // harmless no-op on native, where play() already took effect immediately.
  useEffect(() => {
    player.play();
  }, [player]);

  return (
    <VideoView
      player={player}
      style={[StyleSheet.absoluteFillObject, styles.video]}
      nativeControls={false}
      allowsFullscreen={false}
      contentFit="cover"
      pointerEvents="none"
      playsInline
    />
  );
}

const styles = StyleSheet.create({
  // absoluteFillObject alone (position: absolute + inset 0, no explicit width/height)
  // isn't enough on web: a <video> is a CSS replaced element, so a browser sizes it to
  // its own intrinsic resolution instead of stretching to fill the inset box. Explicit
  // 100%/100% forces it to actually fill the parent regardless of the source video's
  // dimensions; contentFit="cover" (-> object-fit: cover) then crops within that box.
  video: {
    width: '100%',
    height: '100%',
  },
});
