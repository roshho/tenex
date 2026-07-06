import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useMutation } from '@tanstack/react-query';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { analyzeIngredients } from '../lib/api';
import { useRecipeStore } from '../store/recipeStore';
import { colors, spacing, radius, typography } from '../constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Camera'>;
};

export default function CameraScreen({ navigation }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const { setStubs } = useRecipeStore();

  const analyzeMutation = useMutation({
    mutationFn: async (imageUri: string) => {
      const compressed = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 800 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      if (!compressed.base64) throw new Error('Failed to encode image');
      return analyzeIngredients(compressed.base64);
    },
    onSuccess: (data) => {
      setStubs(data.recipes, data.detectedIngredients, data.ingredientSetId);

      const proceed = () => navigation.navigate('RecipeList', { ingredients: data.detectedIngredients });

      if (!data.imageTooDark) {
        proceed();
        return;
      }

      const message = "We identified what we could, but the photo looked a bit dark — some ingredients might be missed. Retake with the flash on, or continue with these results?";
      if (Platform.OS === 'web') {
        window.alert(`That photo looked a bit dark\n\n${message}`);
        proceed();
        return;
      }
      Alert.alert('That photo looked a bit dark', message, [
        { text: 'Retake with Flash', onPress: () => { setTorchOn(true); setCapturedUri(null); } },
        { text: 'Continue Anyway', onPress: proceed },
      ]);
    },
    onError: (err: Error) => {
      const body = `We couldn't identify ingredients in that photo.\n\n${err.message}`;
      if (Platform.OS === 'web') {
        window.alert(`Something went wrong\n\n${body}`);
        return;
      }
      Alert.alert(
        'Something went wrong',
        body,
        [
          { text: 'Retake Photo', style: 'cancel', onPress: handleRetake },
          { text: 'Try Again', onPress: () => capturedUri && analyzeMutation.mutate(capturedUri) },
        ]
      );
    },
  });

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
    if (photo) setCapturedUri(photo.uri);
  };

  const handlePickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setCapturedUri(result.assets[0].uri);
    }
  };

  const handleRetake = () => setCapturedUri(null);

  const handleFindRecipes = () => {
    if (capturedUri) analyzeMutation.mutate(capturedUri);
  };

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionBody}>
          We need your camera to identify ingredients.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={handlePickFromLibrary}>
          <Text style={styles.secondaryButtonText}>Pick from Library</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (capturedUri) {
    return (
      <View style={styles.container}>
        <Image source={{ uri: capturedUri }} style={styles.preview} />
        {analyzeMutation.isPending ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.white} />
            <Text style={styles.loadingText}>Identifying ingredients…</Text>
          </View>
        ) : (
          <View style={styles.previewControls}>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleRetake}>
              <Text style={styles.secondaryButtonText}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} onPress={handleFindRecipes}>
              <Text style={styles.primaryButtonText}>Find Recipes</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing={'back' as CameraType} enableTorch={torchOn}>
        <View style={styles.cameraOverlay}>
          <Text style={styles.cameraHint}>Point at your ingredients</Text>
          <View style={styles.cameraControls}>
            <TouchableOpacity style={styles.libraryButton} onPress={handlePickFromLibrary}>
              <Text style={styles.libraryButtonText}>Library</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.captureButton} onPress={handleCapture} />
            <TouchableOpacity
              style={[styles.libraryButton, torchOn && styles.torchButtonActive]}
              onPress={() => setTorchOn(v => !v)}
            >
              <Text style={styles.libraryButtonText}>{torchOn ? 'Flash On' : 'Flash Off'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.text,
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  cameraHint: {
    ...typography.body,
    color: colors.white,
    textAlign: 'center',
    marginBottom: spacing.lg,
    opacity: 0.8,
  },
  cameraControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    backgroundColor: colors.white,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  libraryButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  torchButtonActive: {
    backgroundColor: colors.accent,
  },
  libraryButtonText: {
    ...typography.body,
    color: colors.white,
  },
  preview: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    ...typography.body,
    color: colors.white,
  },
  previewControls: {
    position: 'absolute',
    bottom: spacing.xxl,
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    gap: spacing.md,
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  permissionTitle: {
    ...typography.h2,
    color: colors.text,
    textAlign: 'center',
  },
  permissionBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    ...typography.body,
    color: colors.white,
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    ...typography.body,
    color: colors.text,
  },
});
