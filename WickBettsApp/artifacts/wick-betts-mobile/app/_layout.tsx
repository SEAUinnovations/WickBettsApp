import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
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
  // Proxy only works in production — the API server's Clerk proxy middleware
  // is a no-op in dev (Clerk proxying is unsupported for dev instances), so
  // in dev we fall back to direct Clerk FAPI calls with the dev key.
  (!__DEV__ && AUTH_DOMAIN ? `${AUTH_DOMAIN}/api/__clerk` : undefined);

function isPublicRoute(segments: string[]): boolean {
  const first = segments[0];
  if (!first) return true;
  return first === 'login' || first === 'auth';
}

function isAuthRoute(segments: string[]): boolean {
  const first = segments[0];
  return first === 'login' || first === 'auth';
}

/** Auth guard — redirects to /login when unauthenticated, or to tabs when authenticated. */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;
    const inAuthScreen = isAuthRoute(segments);
    const inPublicRoute = isPublicRoute(segments);
    if (!user && !inPublicRoute) {
      router.replace('/login');
    } else if (user && inAuthScreen) {
      router.replace('/(tabs)');
    }
  }, [user, isLoading, segments, router]);

  if (isLoading) {
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
      <Stack.Screen name="auth" options={{ headerShown: false, animation: 'none' }} />
      <Stack.Screen name="app" options={{ headerShown: false }} />
      <Stack.Screen name="mentorship" options={{ headerShown: false }} />
      <Stack.Screen name="admin" options={{ headerShown: false }} />
      <Stack.Screen name="admin/users" options={{ headerShown: false }} />
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
