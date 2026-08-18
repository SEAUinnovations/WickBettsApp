import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Platform } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ClerkProvider, ClerkLoaded } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { SignalProvider } from '@/context/SignalContext';
import { AUTH_DOMAIN } from '@/lib/apiUrl';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;
/**
 * Clerk proxy URL for native builds.
 *
 * Resolution order:
 *  1. EXPO_PUBLIC_CLERK_PROXY_URL — explicit override (e.g. set in eas.json)
 *  2. Derived from AUTH_DOMAIN    — same origin the app uses for API calls;
 *                                   works in dev (EXPO_PUBLIC_DOMAIN) and in
 *                                   production (EXPO_PUBLIC_API_URL) without
 *                                   requiring a separate deployment-specific var.
 *  3. undefined — proxy disabled (falls back to direct Clerk FAPI calls)
 */
const proxyUrl: string | undefined =
  process.env.EXPO_PUBLIC_CLERK_PROXY_URL ||
  // Web currently relies on direct Clerk frontend API bootstrap so the
  // public landing page can render even when the proxy route is unavailable.
  (Platform.OS !== 'web' && !__DEV__ && AUTH_DOMAIN ? `${AUTH_DOMAIN}/api/__clerk` : undefined);

function isPublicRoute(segments: string[]): boolean {
  const first = segments[0];
  if (!first) return true;
  return first === 'login' || first === 'sign-in' || first === 'auth' || first === 'sign-up' || first === 'sso-callback';
}

function isAuthRoute(segments: string[]): boolean {
  const first = segments[0];
  return first === 'login' || first === 'sign-in' || first === 'auth';
}

/** Auth guard — redirects to /login when unauthenticated, or to tabs when authenticated. */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isSignedIn } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading && !isSignedIn) return;
    const inAuthScreen = isAuthRoute(segments);
    const inPublicRoute = isPublicRoute(segments);
    if (!isSignedIn && !inPublicRoute) {
      router.replace('/login');
    } else if (isSignedIn && inAuthScreen) {
      router.replace('/(tabs)');
    }
  }, [user, isLoading, isSignedIn, segments, router]);

  if (isLoading && !isSignedIn) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
    );
  }

  return <>{children}</>;
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false, headerBackTitle: 'Back' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false, animation: 'none' }} />
      <Stack.Screen name="sign-in" options={{ headerShown: false, animation: 'none' }} />
      <Stack.Screen name="sign-up" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="sso-callback" options={{ headerShown: false, animation: 'none' }} />
      <Stack.Screen name="auth" options={{ headerShown: false, animation: 'none' }} />
      <Stack.Screen name="mentorship" options={{ headerShown: false }} />
      <Stack.Screen name="learning/index" options={{ headerShown: false }} />
      <Stack.Screen name="learning/lesson" options={{ headerShown: false }} />
      <Stack.Screen name="learning/candle-arcade" options={{ headerShown: false }} />
      <Stack.Screen name="learning/trivia-arena" options={{ headerShown: false }} />
      <Stack.Screen name="learning/trade-bias-simulator" options={{ headerShown: false }} />
      <Stack.Screen name="learning/options-strike-lab" options={{ headerShown: false }} />
      <Stack.Screen name="learning/funded-combine-prep" options={{ headerShown: false }} />
      <Stack.Screen name="admin" options={{ headerShown: false }} />
      <Stack.Screen name="admin/users" options={{ headerShown: false }} />
      <Stack.Screen name="admin/tickets" options={{ headerShown: false }} />
      <Stack.Screen name="admin/mentorship" options={{ headerShown: false }} />
      <Stack.Screen name="contact" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache} proxyUrl={proxyUrl}>
      <ClerkLoaded>
        <SafeAreaProvider>
          <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
              <GestureHandlerRootView>
                <KeyboardProvider>
                  <AuthProvider>
                    <SignalProvider>
                      <AuthGate>
                        <RootLayoutNav />
                      </AuthGate>
                    </SignalProvider>
                  </AuthProvider>
                </KeyboardProvider>
              </GestureHandlerRootView>
            </QueryClientProvider>
          </ErrorBoundary>
        </SafeAreaProvider>
      </ClerkLoaded>
    </ClerkProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: '#08070D', alignItems: 'center', justifyContent: 'center' },
});
