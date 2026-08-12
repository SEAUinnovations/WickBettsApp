import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useClerk } from '@clerk/expo';
import { useSignUp } from '@clerk/expo/legacy';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';

const WB_LOGO = require('@/assets/images/wb-logo.png') as number;

export default function SignUpScreen() {
  const { signUp, isLoaded } = useSignUp();
  const { setActive } = useClerk();
  const router = useRouter();
  const colors = useColors();

  const [step, setStep] = useState<'credentials' | 'verify'>('credentials');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreateAccount = async () => {
    if (!isLoaded || !signUp) return;
    setLoading(true);
    setError('');
    try {
      const desiredUsername = username.trim();
      await signUp.create({
        emailAddress: email.trim(),
        password,
        unsafeMetadata: desiredUsername ? { username: desiredUsername } : undefined,
      });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setStep('verify');
    } catch (err) {
      const msg = (err as { errors?: { message: string }[] })?.errors?.[0]?.message
        ?? (err instanceof Error ? err.message : 'Something went wrong.');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!isLoaded || !signUp) return;
    setLoading(true);
    setError('');
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === 'complete' && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        // AuthGate in _layout.tsx will redirect to /(tabs)
      } else {
        setError('Verification incomplete. Please try again.');
      }
    } catch (err) {
      const msg = (err as { errors?: { message: string }[] })?.errors?.[0]?.message
        ?? (err instanceof Error ? err.message : 'Invalid code. Please try again.');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1a0a2e', '#08070D']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.6 }}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Brand */}
          <View style={styles.brandRow}>
            <Image source={WB_LOGO} style={styles.logo} resizeMode="contain" />
            <View>
              <Text style={[styles.brandName, { color: colors.foreground }]}>WICK BETTS</Text>
              <Text style={[styles.brandSub, { color: colors.mutedForeground }]}>PRIVATE MARKET INTELLIGENCE</Text>
            </View>
          </View>

          {step === 'credentials' ? (
            <>
              <Text style={[styles.heading, { color: colors.foreground }]}>Create your account</Text>
              <Text style={[styles.subheading, { color: colors.mutedForeground }]}>
                Enter your email, choose a password, and optionally add a username.
              </Text>

              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Username <Text style={styles.optionalLabel}>(optional)</Text></Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: '#0f0d18' }]}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="your-handle"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="nickname"
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Email</Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: '#0f0d18' }]}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Password</Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: '#0f0d18' }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="8+ characters"
                  placeholderTextColor={colors.mutedForeground}
                  secureTextEntry
                  textContentType="newPassword"
                />
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Pressable
                onPress={() => void handleCreateAccount()}
                disabled={loading || !email || !password}
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: pressed ? '#6127a4' : '#7C3AED' },
                  (loading || !email || !password) && { opacity: 0.5 },
                ]}
              >
                {loading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.primaryButtonText}>Create account →</Text>}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[styles.heading, { color: colors.foreground }]}>Check your email</Text>
              <Text style={[styles.subheading, { color: colors.mutedForeground }]}>
                We sent a 6-digit code to{' '}
                <Text style={{ color: colors.foreground }}>{email}</Text>
              </Text>

              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Verification code</Text>
                <TextInput
                  style={[styles.input, styles.codeInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: '#0f0d18' }]}
                  value={code}
                  onChangeText={setCode}
                  placeholder="000000"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                />
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Pressable
                onPress={() => void handleVerify()}
                disabled={loading || code.length < 6}
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: pressed ? '#6127a4' : '#7C3AED' },
                  (loading || code.length < 6) && { opacity: 0.5 },
                ]}
              >
                {loading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.primaryButtonText}>Verify email →</Text>}
              </Pressable>

              <Pressable onPress={() => setStep('credentials')} style={styles.backLink}>
                <Text style={[styles.backLinkText, { color: colors.mutedForeground }]}>← Use a different email</Text>
              </Pressable>
            </>
          )}

          {/* Sign in link */}
          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: colors.mutedForeground }]}>Already have an account? </Text>
            <Pressable onPress={() => router.replace('/sign-in' as never)}>
              <Text style={[styles.footerLink, { color: '#a78bfa' }]}>Sign in</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 28, paddingTop: 72, paddingBottom: 48 },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 48,
  },
  logo: { width: 56, height: 56 },
  brandName: { fontSize: 16, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  brandSub: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5, marginTop: 3 },
  heading: { fontSize: 28, fontFamily: 'Inter_700Bold', marginBottom: 10, lineHeight: 34 },
  subheading: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 22, marginBottom: 32 },
  field: { marginBottom: 20 },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' },
  optionalLabel: { fontFamily: 'Inter_400Regular', textTransform: 'none', letterSpacing: 0, fontSize: 11 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  codeInput: { textAlign: 'center', fontSize: 24, fontFamily: 'Inter_700Bold', letterSpacing: 8 },
  errorText: { color: '#ef4444', fontSize: 13, fontFamily: 'Inter_400Regular', marginBottom: 16 },
  primaryButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 52,
  },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontFamily: 'Inter_700Bold' },
  backLink: { alignItems: 'center', paddingVertical: 16 },
  backLinkText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 32 },
  footerText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  footerLink: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
