import { useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

/**
 * Referral link landing route: wickbetts.com/r/<code> (web) and the
 * equivalent deep link on native. Its only job is to carry the code
 * through to sign-up, which is where it actually gets attached to the new
 * account (see app/sign-up.tsx and docs/referral-program-plan.md). Kept as
 * its own route rather than baking `/r/*` handling into sign-up directly so
 * a shared link always has a clean, memorable path regardless of where
 * sign-up itself lives.
 */
export default function ReferralRedirect() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace({ pathname: '/sign-up', params: code ? { ref: code } : undefined } as never);
  }, [code, router]);

  return (
    <View style={styles.root}>
      <ActivityIndicator size="large" color="#7C3AED" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#08070D' },
});
