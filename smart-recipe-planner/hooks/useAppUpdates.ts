import { useEffect, useState } from 'react';
import * as Updates from 'expo-updates';

const CHECK_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

// expo-updates' default checkAutomatically behavior always defers a downloaded
// update to the *next* cold start, no matter which policy value is set — there's
// no native config knob for same-session adoption. This explicit check-fetch-reload
// flow means a published `eas update` takes effect on the very launch that detects
// it, instead of silently requiring an unexplained second relaunch.
export function useAppUpdates() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (__DEV__ || !Updates.isEnabled) {
        if (!cancelled) setReady(true);
        return;
      }

      try {
        const result = await withTimeout(Updates.checkForUpdateAsync(), CHECK_TIMEOUT_MS);
        if (cancelled) return;

        if (result?.isAvailable) {
          const fetchResult = await withTimeout(Updates.fetchUpdateAsync(), CHECK_TIMEOUT_MS);
          if (cancelled) return;

          if (fetchResult?.isNew) {
            await Updates.reloadAsync(); // tears down JS context; nothing after this matters
            return;
          }
        }
      } catch {
        // Network errors, rate limiting, offline device, etc. must never block startup.
      }

      if (!cancelled) setReady(true);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return ready;
}
