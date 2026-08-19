import React, { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PrimaryButton } from '@/components/WickUI';
import { useColors } from '@/hooks/useColors';
import { useAuth, type Plan } from '@/context/AuthContext';

/**
 * Shared billing action helpers used by the Profile screen and the Signals
 * subscription gate. Mirrors the web app's startCheckout / openBillingPortal /
 * lapsed-recovery behaviour (see wick-betts/src/App.tsx).
 */

type BillingAction = 'signals' | 'mentorship' | 'membership' | 'portal' | 'cancel' | 'resume';

function useBillingActions() {
  const { startCheckout, openBillingPortal, cancelSubscription, resumeSubscription } = useAuth();
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

  const runCancel = async () => {
    setError('');
    setLoading('cancel');
    try {
      await cancelSubscription();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel your subscription. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  const runResume = async () => {
    setError('');
    setLoading('resume');
    try {
      await resumeSubscription();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resume your subscription. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  return { loading, error, runCheckout, runPortal, runCancel, runResume };
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
 * profile plan cards (Membership $50, Signals $250, Mentorship $500) and the
 * pricing compare table on the front page (see app/index.tsx).
 */
export function SubscribePanel() {
  const { loading, error, runCheckout } = useBillingActions();
  return (
    <View style={styles.stack}>
      <Text style={styles.includedNote}>Every plan includes community access, the full Learning tab, and trade reviews.</Text>
      <Text style={styles.stripeNote}>Secure checkout opens in Stripe.</Text>
      <Text style={styles.finalSaleNote}>All sales are final — no refunds. See Legal for the full billing policy.</Text>
      <ActionButton
        onPress={() => void runCheckout('membership')}
        icon="sparkles-outline"
        busy={loading === 'membership'}
        disabled={loading !== null}
        testID="subscribe-membership"
      >
        Subscribe · Membership $50
      </ActionButton>
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
 * Explicit in-app "Cancel subscription" action. Cancels at the end of the
 * current billing period (member keeps access until then) rather than
 * immediately, and asks for confirmation first since this is destructive.
 * Deliberately a plain text button, not a filled PrimaryButton — cancelling
 * shouldn't visually compete with the other billing actions.
 */
export function CancelSubscriptionButton({ renewalDate }: { renewalDate?: string | null }) {
  const colors = useColors();
  const { loading, error, runCancel } = useBillingActions();
  const busy = loading === 'cancel';

  const confirmCancel = () => {
    const message = renewalDate
      ? `You'll keep access until ${renewalDate}, then your subscription will end. You can undo this anytime before then.`
      : "You'll keep access until the end of your current billing period, then your subscription will end.";
    // react-native-web's Alert.alert doesn't reliably support multi-button
    // dialogs with onPress callbacks — same issue as the sign-out confirm.
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`Cancel subscription?\n\n${message}`)) {
        void runCancel();
      }
      return;
    }
    Alert.alert('Cancel subscription?', message, [
      { text: 'Keep subscription', style: 'cancel' },
      { text: 'Cancel subscription', style: 'destructive', onPress: () => void runCancel() },
    ]);
  };

  return (
    <View style={styles.stack}>
      <Pressable
        onPress={confirmCancel}
        disabled={busy}
        style={({ pressed }) => [styles.cancelButton, { opacity: busy ? 0.5 : pressed ? 0.7 : 1 }]}
        accessibilityRole="button"
        testID="cancel-subscription"
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.destructive} />
        ) : (
          <Text style={[styles.cancelText, { color: colors.destructive }]}>Cancel subscription</Text>
        )}
      </Pressable>
      <ErrorLine message={error} />
    </View>
  );
}

/** Undo a pending cancel-at-period-end. */
export function ResumeSubscriptionButton() {
  const { loading, error, runResume } = useBillingActions();
  return (
    <View style={styles.stack}>
      <ActionButton
        onPress={() => void runResume()}
        icon="refresh-outline"
        busy={loading === 'resume'}
        disabled={loading !== null}
        testID="resume-subscription"
      >
        Keep my subscription
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
  includedNote: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular', color: '#A59DB3' },
  finalSaleNote: { fontSize: 10, lineHeight: 15, fontFamily: 'Inter_500Medium', color: '#8A8398' },
  busyButton: {
    minHeight: 52,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.5 },
  error: { fontSize: 12, fontFamily: 'Inter_600SemiBold', lineHeight: 17, marginTop: 2 },
  cancelButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
