import React from 'react';
import { StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

// TODO: replace assets/landing-background.mp4 with real footage — this is a small
// generated placeholder (solid color + "replace this file" text) just so the player
// wiring (loop/mute/cover) is real and testable. Swap the file in place; no code change
// needed as long as the replacement keeps the same filename.
const videoSource = require('../assets/landing-background.mp4');

export default function VideoBackground() {
  const player = useVideoPlayer(videoSource, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFillObject}
      nativeControls={false}
      allowsFullscreen={false}
      contentFit="cover"
      pointerEvents="none"
    />
  );
}
