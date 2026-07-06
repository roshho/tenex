import { Alert, Platform } from 'react-native';

// Alert.alert is a no-op on react-native-web, so failures there were showing nothing at all.
export function showError(title: string, message: string, onRetry?: () => void) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    ...(onRetry ? [{ text: 'Try Again', onPress: onRetry }] : []),
  ]);
}
