import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PrimaryButton } from '@/components/WickUI';
import { useColors } from '@/hooks/useColors';
import { useAuth, type Plan } from '@/context/AuthContext';

/**
 * Shared billing action helpers used by the Profile screen and the Signals
 * subscription gate. Mirrors the web app's startCheckout / openBillingPortal /
 * lapsed-recovery behaviour (see wick-betts/src/App.tsx).
 */

type BillingAction = 'signals' | 'mentorship' | 'membership' | 'portal';

function useBillingActions() {
  const { startCheckout, openBillingPortal } = useAuth();
  const [loading, setLoading] = useState<BillingAction | null>(null);
  const [error, setError] = useState('');

  const runCheckout = async (plan: Plan) => {
    setError('');
    setLoading(plan);
    try {
      await startCheckout(plan);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  const runPortal = async () => {
    setError('');
    setLoading('portal');
    try {
      await openBillingPortal();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  return { loading, error, runCheckout, runPortal };
}

/** Loading spinner wrapper so buttons show progress inline. */
function ActionButton({
  onPress,
  icon,
  busy,
  disabled,
  testID,
  children,
}: {
  onPress: () => void;
  icon: keyof typeof Ionicons.glyphMap;
  busy: boolean;
  disabled: boolean;
  testID?: string;
  children: React.ReactNode;
}) {
  const colors = useColors();
  if (busy) {
    return (
      <View style={[styles.busyButton, { backgroundColor: colors.primary }]}>
        <ActivityIndicator color={colors.primaryForeground} />
      </View>
    );
  }
  return (
    <View style={disabled ? styles.disabled : undefined} pointerEvents={disabled ? 'none' : 'auto'}>
      <PrimaryButton onPress={onPress} icon={icon} testID={testID}>
        {children}
      </PrimaryButton>
    </View>
  );
}

function ErrorLine({ message }: { message: string }) {
  const colors = useColors();
  if (!message) return null;
  return <Text style={[styles.error, { color: colors.destructive }]}>{message}</Text>;
}

/**
 * Plan selection for members with no subscription — matches the web landing /
 * profile plan cards (Signals $250, Mentorship $500).
 */
export function SubscribePanel() {
  const { loading, error, runCheckout } = useBillingActions();
  return (
    <View style={styles.stack}>
      <Text style={styles.stripeNote}>Secure checkout opens in Stripe.</Text>
      <ActionButton
        onPress={() => void runCheckout('signals')}
        icon="pulse-outline"
        busy={loading === 'signals'}
        disabled={loading !== null}
        testID="subscribe-signals"
      >
        Subscribe · Signals $250
      </ActionButton>
      <ActionButton
        onPress={() => void runCheckout('mentorship')}
        icon="ribbon-outline"
        busy={loading === 'mentorship'}
        disabled={loading !== null}
        testID="subscribe-mentorship"
      >
        Subscribe · Mentorship $500
      </ActionButton>
      <ActionButton
        onPress={() => void runCheckout('membership')}
        icon="sparkles-outline"
        busy={loading === 'membership'}
        disabled={loading !== null}
        testID="subscribe-membership"
      >
        Subscribe · Membership
      </ActionButton>
      <ErrorLine message={error} />
    </View>
  );
}

/** "Upgrade to mentorship" checkout for members on the signals plan. */
export function UpgradeMentorshipButton() {
  const { loading, error, runCheckout } = useBillingActions();
  return (
    <View style={styles.stack}>
      <Text style={styles.stripeNote}>Secure checkout opens in Stripe.</Text>
      <ActionButton
        onPress={() => void runCheckout('mentorship')}
        icon="ribbon-outline"
        busy={loading === 'mentorship'}
        disabled={loading !== null}
        testID="upgrade-mentorship"
      >
        Upgrade to Mentorship · $500
      </ActionButton>
      <ErrorLine message={error} />
    </View>
  );
}

/** "Manage billing" portal button for active subscribers. */
export function ManageBillingButton() {
  const { loading, error, runPortal } = useBillingActions();
  return (
    <View style={styles.stack}>
      <Text style={styles.stripeNote}>Billing management opens through Stripe.</Text>
      <ActionButton
        onPress={() => void runPortal()}
        icon="card-outline"
        busy={loading === 'portal'}
        disabled={loading !== null}
        testID="manage-billing"
      >
        Manage billing
      </ActionButton>
      <ErrorLine message={error} />
    </View>
  );
}

/**
 * Recovery actions for a lapsed subscription. Mirrors the web lapsed screen:
 *  - past_due  → portal to update the payment method
 *  - canceled  → re-subscribe checkout, plus portal if a Stripe customer exists
 */
export function LapsedRecovery({
  status,
  plan,
  hasStripeCustomer,
}: {
  status: string;
  plan: Plan;
  hasStripeCustomer: boolean;
}) {
  const { loading, error, runCheckout, runPortal } = useBillingActions();
  const isPastDue = status === 'past_due';
  return (
    <View style={styles.stack}>
      <Text style={styles.stripeNote}>Secure checkout opens in Stripe.</Text>
      {isPastDue ? (
        <ActionButton
          onPress={() => void runPortal()}
          icon="card-outline"
          busy={loading === 'portal'}
          disabled={loading !== null}
          testID="recover-update-payment"
        >
          Update payment method
        </ActionButton>
      ) : (
        <>
          <ActionButton
            onPress={() => void runCheckout(plan)}
            icon="refresh-outline"
            busy={loading === plan}
            disabled={loading !== null}
            testID="recover-resubscribe"
          >
            Re-subscribe
          </ActionButton>
          {hasStripeCustomer ? (
            <ActionButton
              onPress={() => void runPortal()}
              icon="card-outline"
              busy={loading === 'portal'}
              disabled={loading !== null}
              testID="recover-manage-billing"
            >
              Manage billing
            </ActionButton>
          ) : null}
        </>
      )}
      <ErrorLine message={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  stripeNote: { fontSize: 11, fontFamily: 'Inter_500Medium', color: '#A78BFA' },
  busyButton: {
    minHeight: 52,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.5 },
  error: { fontSize: 12, fontFamily: 'Inter_600SemiBold', lineHeight: 17, marginTop: 2 },
});
