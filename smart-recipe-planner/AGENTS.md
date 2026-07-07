# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

## expo-video on Android: SurfaceView + backgrounding

`VideoView`'s default `surfaceType="surfaceView"` can lose its render surface when the Android app is backgrounded/foregrounded (multitasking), leaving playback stuck on a stale frame or looping only the first buffered segment. `components/VideoBackground.tsx` works around this with `surfaceType="textureView"` on Android plus an `AppState`-driven `player.play()` on resume. Keep this pattern for any other looping/autoplay `VideoView` usage added later.
