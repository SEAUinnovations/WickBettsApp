import React, { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { Card, PrimaryButton, Tag } from '@/components/WickUI';
import { TickerAutocomplete } from '@/components/TickerAutocomplete';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useSignals, type OptionType, type Signal, type SignalDirection, type SignalInput, type SignalMarket, type SignalStatus, type SignalStyle } from '@/context/SignalContext';

const STATUS_OPTIONS: SignalStatus[] = ['Active', 'Watching', 'Closed', 'Stopped'];
const STYLE_OPTIONS: SignalStyle[] = ['Day Trade', 'Swing', 'Buy & Hold', 'LEAPS'];

type FormState = {
  asset: string; sector: string; market: SignalMarket; direction: SignalDirection; status: SignalStatus; style: SignalStyle;
  timeframe: string; entry: string; target: string; stop: string; risk: string; analysis: string;
  isOption: boolean; optionType: OptionType; contract: string; expiration: string; strike: string;
  premium: string; bid: string; ask: string; impliedVolatility: string;
  delta: string; gamma: string; theta: string; vega: string; openInterest: string;
};

const initialForm: FormState = {
  asset: '', sector: '', market: 'Stocks', direction: 'Long', status: 'Active', style: 'Swing',
  timeframe: '', entry: '', target: '', stop: '', risk: 'Medium', analysis: '',
  isOption: true, optionType: 'Call', contract: '', expiration: '', strike: '',
  premium: '', bid: '', ask: '', impliedVolatility: '', delta: '', gamma: '',
  theta: '', vega: '', openInterest: '',
};

/** ~N months out from today, formatted for the Expiration field. */
function monthsOut(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Build the flat form state from an existing signal for editing. */
function formFromSignal(s: Signal): FormState {
  return {
    asset: s.asset,
    sector: s.sector ?? '',
    market: s.market,
    direction: s.direction,
    status: s.status,
    style: s.style ?? 'Swing',
    timeframe: s.timeframe,
    entry: s.entry,
    target: s.target,
    stop: s.stop ?? '',
    risk: s.risk,
    analysis: s.analysis,
    isOption: s.isOption,
    optionType: s.optionType ?? 'Call',
    contract: s.contract ?? '',
    expiration: s.expiration ?? '',
    strike: s.strike ?? '',
    premium: s.premium ?? '',
    bid: s.bid ?? '',
    ask: s.ask ?? '',
    impliedVolatility: s.impliedVolatility ?? '',
    delta: s.delta != null ? String(s.delta) : '',
    gamma: s.gamma != null ? String(s.gamma) : '',
    theta: s.theta != null ? String(s.theta) : '',
    vega: s.vega != null ? String(s.vega) : '',
    openInterest: s.openInterest ?? '',
  };
}

export default function AdminScreen() {
  const router = useRouter();
  const colors = useColors();
  const { getToken, user } = useAuth();
  const { signals, addSignal, updateSignal, deleteSignal } = useSignals();
  const [form, setForm] = useState<FormState>(initialForm);
  const [error, setError] = useState('');
  const [published, setPublished] = useState(false);
  const [scanImage, setScanImage] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingStarId, setTogglingStarId] = useState<string | null>(null);

  // Signals currently featured in the Community tab's Signals feed — capped
  // at 4 server-side (see MAX_COMMUNITY_STARRED in routes/signals.ts), kept
  // here just so the UI can disable the star action once the cap is hit
  // instead of only finding out after a failed request.
  const starredCount = signals.filter((s) => s.communityStarred).length;
  const MAX_COMMUNITY_STARRED = 4;

  const isAdmin = user?.role === 'admin';

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((c) => ({ ...c, [key]: value }));

  // Style drives isOption: LEAPS is always an options contract, Buy & Hold
  // is always spot/equity. Swing leaves whatever the admin had selected.
  const setStyle = (style: SignalStyle) => {
    setForm((c) => ({
      ...c,
      style,
      isOption: style === 'LEAPS' ? true : style === 'Buy & Hold' ? false : c.isOption,
      stop: style === 'Buy & Hold' ? '' : c.stop,
    }));
  };

  const applyLeapsExpiry = (months: number) => {
    setForm((c) => ({ ...c, expiration: monthsOut(months), timeframe: `~${months}mo LEAPS` }));
  };

  const startEdit = (s: Signal) => {
    setEditingId(s.id);
    setForm(formFromSignal(s));
    setError('');
    setPublished(false);
    setScanImage(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(initialForm);
    setError('');
  };

  const quickStatus = async (s: Signal, next: SignalStatus) => {
    if (s.status === next) return;
    setUpdatingStatusId(s.id);
    setError('');
    try {
      await updateSignal(s.id, { status: next });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update status. Try again.');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const toggleCommunityStar = async (s: Signal) => {
    setTogglingStarId(s.id);
    setError('');
    try {
      await updateSignal(s.id, { communityStarred: !s.communityStarred });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update Community feature. Try again.');
    } finally {
      setTogglingStarId(null);
    }
  };

  // Featuring a signal is instant (low-risk, additive) — but the bookmark
  // toggling straight back off on a second tap meant a stray double-tap
  // could silently unfeature a signal with no way to notice. Same
  // confirm-then-act pattern as confirmDelete below: starring stays
  // one-tap, unstarring needs a confirmation.
  const confirmUnstar = (s: Signal) => {
    const label = `Remove ${s.asset} from Community?`;
    if (Platform.OS === 'web') {
      if (window.confirm(label)) void toggleCommunityStar(s);
      return;
    }
    Alert.alert(
      'Remove from Community',
      `${label} It'll stop showing in the Community tab's featured signals.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => void toggleCommunityStar(s) },
      ],
    );
  };

  const doDelete = async (s: Signal) => {
    setDeletingId(s.id);
    setError('');
    try {
      await deleteSignal(s.id);
      if (editingId === s.id) cancelEdit();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete signal. Try again.');
    } finally {
      setDeletingId(null);
    }
  };

  // Alert.alert's multi-button dialogs silently no-op on react-native-web, so
  // use window.confirm there (same pattern as sign-out / cancel-subscription).
  const confirmDelete = (s: Signal) => {
    const label = s.source === 'auto' ? 'Dismiss this auto-generated signal?' : `Delete the ${s.asset} signal?`;
    if (Platform.OS === 'web') {
      if (window.confirm(label)) void doDelete(s);
      return;
    }
    Alert.alert(
      s.source === 'auto' ? 'Dismiss signal' : 'Delete signal',
      `${label} This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: s.source === 'auto' ? 'Dismiss' : 'Delete', style: 'destructive', onPress: () => void doDelete(s) },
      ],
    );
  };

  const isValid = useMemo(
    () =>
      [form.asset, form.timeframe, form.entry, form.target, form.analysis].every((v) => v.trim().length > 0) &&
      (form.style === 'Buy & Hold' || form.stop.trim().length > 0) &&
      (!form.isOption || [form.contract, form.expiration, form.strike, form.premium, form.impliedVolatility, form.delta, form.gamma, form.theta, form.vega].every((v) => v.trim().length > 0)),
    [form],
  );

  const pickScreenshot = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to scan trade screenshots.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      base64: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setScanImage(asset.uri);
    if (asset.base64) {
      await scanScreenshot(asset.base64);
    }
  };

  const scanScreenshot = async (base64: string) => {
    setScanning(true);
    const authToken = await getToken();
    try {
      const { API_BASE } = await import('@/lib/apiUrl');
      const res = await fetch(`${API_BASE}/admin/extract-signal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        Alert.alert('Scan failed', err.error ?? 'Could not read the screenshot. Fill in the fields manually.');
        return;
      }
      const extracted = (await res.json()) as Partial<FormState>;
      setForm((prev) => ({ ...prev, ...extracted }));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Scan unavailable', 'AI screenshot scanning requires the OpenAI integration to be enabled. Fill in the fields manually.');
    } finally {
      setScanning(false);
    }
  };

  const buildPayload = (): SignalInput => ({
    asset: form.asset.trim().toUpperCase(),
    sector: form.sector.trim() || undefined,
    market: form.market, direction: form.direction, status: form.status, style: form.style,
    entry: form.entry.trim(), target: form.target.trim(),
    stop: form.style === 'Buy & Hold' ? undefined : form.stop.trim(),
    timeframe: form.timeframe.trim(), risk: form.risk.trim(), analysis: form.analysis.trim(),
    isOption: form.isOption,
    optionType: form.isOption ? form.optionType : undefined,
    contract: form.isOption ? form.contract.trim().toUpperCase() : undefined,
    expiration: form.isOption ? form.expiration.trim() : undefined,
    strike: form.isOption ? form.strike.trim() : undefined,
    premium: form.isOption ? form.premium.trim() : undefined,
    bid: form.isOption ? form.bid.trim() : undefined,
    ask: form.isOption ? form.ask.trim() : undefined,
    impliedVolatility: form.isOption ? form.impliedVolatility.trim() : undefined,
    delta: form.isOption ? Number(form.delta) : undefined,
    gamma: form.isOption ? Number(form.gamma) : undefined,
    theta: form.isOption ? Number(form.theta) : undefined,
    vega: form.isOption ? Number(form.vega) : undefined,
    openInterest: form.isOption ? form.openInterest.trim() : undefined,
  });

  const publish = async () => {
    Keyboard.dismiss();
    if (!isValid) {
      setError(form.isOption ? 'Complete setup and all options fields.' : form.style === 'Buy & Hold' ? 'Complete the setup fields (entry, target — no stop needed).' : 'Complete the setup fields.');
      return;
    }
    setError('');
    try {
      if (editingId) {
        await updateSignal(editingId, buildPayload());
      } else {
        await addSignal(buildPayload());
      }
      setForm(initialForm);
      setEditingId(null);
      setScanImage(null);
      setPublished(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save signal. Try again.');
    }
  };

  if (!isAdmin) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={styles.gate}>
          <Ionicons name="shield-outline" size={30} color={colors.mutedForeground} />
          <Text style={[styles.gateTitle, { color: colors.foreground }]}>Admin only</Text>
          <Text style={[styles.gateText, { color: colors.mutedForeground }]}>This room is not accessible to members.</Text>
          <Pressable onPress={() => router.back()} style={[styles.gateButton, { borderColor: colors.border }]} accessibilityRole="button">
            <Text style={[styles.gateButtonText, { color: colors.primary }]}>Go back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        bottomOffset={80}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button">
            <Ionicons name="arrow-back" size={21} color={colors.foreground} />
          </Pressable>
          <View>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>WICK BETTS / ADMIN</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>{editingId ? 'Edit signal' : 'Signal studio'}</Text>
          </View>
          <Tag>ADMIN</Tag>
        </View>

        {/* Live notice */}
        <View style={[styles.notice, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
          <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
            Published signals appear immediately in the member feed. Only admins can post.
          </Text>
        </View>

        {/* Greeks disclaimer */}
        <View style={[styles.disclaimer, { backgroundColor: '#1a120a', borderColor: '#6b3a1a' }]}>
          <Ionicons name="information-circle-outline" size={17} color="#E2A87A" />
          <View style={{ flex: 1 }}>
            <Text style={styles.disclaimerTitle}>Greeks are point-in-time</Text>
            <Text style={styles.disclaimerBody}>
              Delta, gamma, theta, vega, and IV shown here reflect the values at the time the trade was entered — not live market data. These numbers will drift as the underlying moves and time passes.
            </Text>
          </View>
        </View>

        {/* Screenshot scanner */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>AI screenshot scan</Text>
        <View style={[styles.scanBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {scanImage ? (
            <Image source={{ uri: scanImage }} style={styles.scanPreview} resizeMode="contain" />
          ) : (
            <Ionicons name="image-outline" size={32} color={colors.mutedForeground} />
          )}
          <Text style={[styles.scanCaption, { color: colors.mutedForeground }]}>
            {scanning
              ? 'Scanning screenshot with AI…'
              : scanImage
              ? 'Screenshot loaded. Edit fields below if needed.'
              : 'Drop a trade screenshot and fields auto-fill from the image.'}
          </Text>
          <Pressable
            onPress={() => void pickScreenshot()}
            disabled={scanning}
            style={[styles.scanButton, { backgroundColor: colors.secondary, borderColor: colors.border }, scanning && { opacity: 0.5 }]}
            accessibilityRole="button"
          >
            <Ionicons name={scanning ? 'hourglass-outline' : 'camera-outline'} size={16} color={colors.primary} />
            <Text style={[styles.scanButtonText, { color: colors.primary }]}>
              {scanning ? 'Scanning…' : scanImage ? 'Scan different screenshot' : 'Choose screenshot'}
            </Text>
          </Pressable>
        </View>

        {/* Success */}
        {published ? (
          <View style={[styles.success, { backgroundColor: '#11271E' }]}>
            <Ionicons name="checkmark-circle" size={18} color="#7AE2AA" />
            <Text style={styles.successText}>
              {editingId ? 'Signal updated in the member feed.' : 'Signal published and live in the member feed.'}
            </Text>
          </View>
        ) : null}

        {/* Editing banner */}
        {editingId ? (
          <View style={[styles.editingBanner, { backgroundColor: colors.secondary, borderColor: colors.primary }]}>
            <Ionicons name="create-outline" size={17} color={colors.primary} />
            <Text style={[styles.editingText, { color: colors.foreground }]}>Editing an existing signal</Text>
            <Pressable onPress={cancelEdit} accessibilityRole="button" hitSlop={8}>
              <Text style={[styles.editingCancel, { color: colors.primary }]}>Cancel</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Trading style */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Trading style</Text>
        <View style={styles.segmentRow}>
          {STYLE_OPTIONS.map((st) => (
            <Segment key={st} active={form.style === st} label={st} onPress={() => setStyle(st)} />
          ))}
        </View>
        <Text style={[styles.styleHint, { color: colors.mutedForeground }]}>
          {form.style === 'Buy & Hold'
            ? 'Long-term spot position — entry + target only, no hard stop-loss.'
            : form.style === 'LEAPS'
            ? 'Long-dated options contract (6mo+). Pick a quick expiry below or set one manually in Contract details.'
            : form.style === 'Day Trade'
            ? 'Same-session setup — expected to resolve intraday. Full entry / target / stop, tight timeframe.'
            : 'Short-hold setup (days/weeks) with a full entry / target / stop.'}
        </Text>
        {form.style === 'LEAPS' ? (
          <View style={styles.segmentRow}>
            <Segment active={false} label="~6 months" onPress={() => applyLeapsExpiry(6)} />
            <Segment active={false} label="~8 months" onPress={() => applyLeapsExpiry(8)} />
            <Segment active={false} label="~12 months" onPress={() => applyLeapsExpiry(12)} />
          </View>
        ) : null}

        {/* Signal type */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Signal type</Text>
        {form.style === 'Swing' || form.style === 'Day Trade' ? (
          <View style={styles.segmentRow}>
            <Segment active={form.isOption} label="Options contract" onPress={() => update('isOption', true)} />
            <Segment active={!form.isOption} label="Spot / equity" onPress={() => update('isOption', false)} />
          </View>
        ) : (
          <View style={[styles.lockedType, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Ionicons name="lock-closed-outline" size={13} color={colors.mutedForeground} />
            <Text style={[styles.lockedTypeText, { color: colors.mutedForeground }]}>
              {form.style === 'LEAPS' ? 'Options contract — required for LEAPS' : 'Spot / equity — required for Buy & Hold'}
            </Text>
          </View>
        )}

        {/* Core setup */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Core setup</Text>
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Underlying / ticker</Text>
          <TickerAutocomplete
            value={form.asset}
            onChangeText={(v) => update('asset', v)}
            placeholder="e.g. NVDA"
            testID="admin-asset-input"
          />
        </View>
        <Field label="Sector (optional)" value={form.sector} onChangeText={(v) => update('sector', v)} placeholder="e.g. Technology" />
        <View style={styles.twoCol}>
          <SelectField label="Market" value={form.market} options={['Stocks','Crypto']} onChange={(v) => update('market', v as SignalMarket)} />
          <SelectField label="Direction" value={form.direction} options={['Long','Short']} onChange={(v) => update('direction', v as SignalDirection)} />
        </View>
        <View style={styles.twoCol}>
          <SelectField label="Status" value={form.status} options={['Active','Watching','Closed','Stopped']} onChange={(v) => update('status', v as SignalStatus)} />
          <Field label="Timeframe" value={form.timeframe} onChangeText={(v) => update('timeframe', v)} placeholder="e.g. Aug 22 expiry" />
        </View>
        {form.style === 'Buy & Hold' ? (
          <View style={styles.twoCol}>
            <Field label="Entry" value={form.entry} onChangeText={(v) => update('entry', v)} placeholder="$3.42" />
            <Field label="Long-term target" value={form.target} onChangeText={(v) => update('target', v)} placeholder="$5.10" />
          </View>
        ) : (
          <View style={styles.threeCol}>
            <Field label={form.isOption ? 'Debit / entry' : 'Entry'} value={form.entry} onChangeText={(v) => update('entry', v)} placeholder="$3.42" />
            <Field label="Target" value={form.target} onChangeText={(v) => update('target', v)} placeholder="$5.10" />
            <Field label="Stop" value={form.stop} onChangeText={(v) => update('stop', v)} placeholder="$2.10" />
          </View>
        )}

        {/* Options-specific */}
        {form.isOption ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Contract details</Text>
            <View style={styles.segmentRow}>
              <Segment active={form.optionType === 'Call'} label="Call" onPress={() => update('optionType', 'Call')} />
              <Segment active={form.optionType === 'Put'} label="Put" onPress={() => update('optionType', 'Put')} />
            </View>
            <Field label="Contract" value={form.contract} onChangeText={(v) => update('contract', v)} placeholder="NVDA 22 AUG 26 130 C" />
            <View style={styles.twoCol}>
              <Field label="Expiration" value={form.expiration} onChangeText={(v) => update('expiration', v)} placeholder="Aug 22, 2026" />
              <Field label="Strike" value={form.strike} onChangeText={(v) => update('strike', v)} placeholder="$130.00" />
            </View>
            <View style={styles.threeCol}>
              <Field label="Premium" value={form.premium} onChangeText={(v) => update('premium', v)} placeholder="$3.42" />
              <Field label="Bid" value={form.bid} onChangeText={(v) => update('bid', v)} placeholder="$3.38" />
              <Field label="Ask" value={form.ask} onChangeText={(v) => update('ask', v)} placeholder="$3.46" />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Greeks & liquidity (at entry)</Text>
            <View style={[styles.greeksNote, { backgroundColor: colors.muted }]}>
              <Text style={[styles.greeksNoteText, { color: colors.mutedForeground }]}>
                Enter the values shown at time of trade. These are snapshot figures, not live data.
              </Text>
            </View>
            <View style={styles.fourCol}>
              <Field label="IV" value={form.impliedVolatility} onChangeText={(v) => update('impliedVolatility', v)} placeholder="48.6%" />
              <Field label="Delta Δ" value={form.delta} onChangeText={(v) => update('delta', v)} placeholder="0.42" keyboardType="decimal-pad" />
              <Field label="Gamma Γ" value={form.gamma} onChangeText={(v) => update('gamma', v)} placeholder="0.018" keyboardType="decimal-pad" />
              <Field label="Theta Θ" value={form.theta} onChangeText={(v) => update('theta', v)} placeholder="-0.11" keyboardType="decimal-pad" />
            </View>
            <View style={styles.twoCol}>
              <Field label="Vega V" value={form.vega} onChangeText={(v) => update('vega', v)} placeholder="0.19" keyboardType="decimal-pad" />
              <Field label="Open interest" value={form.openInterest} onChangeText={(v) => update('openInterest', v)} placeholder="18,420" />
            </View>
          </>
        ) : null}

        {/* Analysis */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Wick's read</Text>
        <Field label="Analysis" value={form.analysis} onChangeText={(v) => update('analysis', v)} placeholder="Explain the setup, context, and invalidation..." multiline />

        {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}

        <PrimaryButton onPress={() => void publish()} icon={editingId ? 'save-outline' : 'paper-plane-outline'} testID="publish-signal">
          {editingId ? 'Save changes' : 'Publish signal to members'}
        </PrimaryButton>
        <Text style={[styles.footerNote, { color: colors.mutedForeground }]}>
          Double-check contract data before publishing. Greeks are point-in-time snapshots. Educational content only.
        </Text>

        {/* Existing signals */}
        <Text style={[styles.sectionTitle, styles.listHeading, { color: colors.foreground }]}>
          Published signals ({signals.length})
        </Text>
        <Text style={[styles.footerNote, { marginTop: -6, marginBottom: 10, color: colors.mutedForeground }]}>
          {starredCount}/{MAX_COMMUNITY_STARRED} featured in Community right now. Tap the bookmark on a signal to feature or unfeature it.
        </Text>
        {signals.length === 0 ? (
          <View style={[styles.notice, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Ionicons name="radio-outline" size={18} color={colors.mutedForeground} />
            <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
              No signals yet. Publish your first signal above.
            </Text>
          </View>
        ) : (
          signals.map((s) => (
            <Card key={s.id} style={styles.signalRow}>
              <View style={styles.signalRowTop}>
                <View style={{ flex: 1 }}>
                  <View style={styles.signalRowTitle}>
                    <Text style={[styles.signalAsset, { color: colors.foreground }]}>{s.asset}</Text>
                    {s.isOption ? <Tag>{s.optionType ?? 'OPTION'}</Tag> : null}
                    <Tag tone="orange">{s.style || 'Swing'}</Tag>
                    {s.source === 'auto' ? (
                      <View style={[styles.autoBadge, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                        <Ionicons name="flash-outline" size={10} color={colors.mutedForeground} />
                        <Text style={[styles.autoBadgeText, { color: colors.mutedForeground }]}>AUTO</Text>
                      </View>
                    ) : null}
                    {s.newsAlert ? (
                      <Ionicons name="star" size={14} color="#E2C25A" accessibilityLabel="Keep in mind: near a major news event" />
                    ) : null}
                  </View>
                  <Text style={[styles.signalMeta, { color: colors.mutedForeground }]}>
                    {s.market}{s.sector ? ` · ${s.sector}` : ''} · {s.direction} · {s.postedAt}
                  </Text>
                  {s.newsAlert && s.newsAlertNote ? (
                    <Text style={[styles.newsAlertNote, { color: '#E2C25A' }]}>{s.newsAlertNote}</Text>
                  ) : null}
                </View>
                <View style={styles.rowActions}>
                  <Pressable
                    onPress={() => (s.communityStarred ? confirmUnstar(s) : void toggleCommunityStar(s))}
                    disabled={togglingStarId === s.id || (!s.communityStarred && starredCount >= MAX_COMMUNITY_STARRED)}
                    style={[
                      styles.editButton,
                      { borderColor: colors.border },
                      !s.communityStarred && starredCount >= MAX_COMMUNITY_STARRED && { opacity: 0.5 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={s.communityStarred ? `Remove ${s.asset} from Community` : `Feature ${s.asset} in Community`}
                    testID={`toggle-community-star-${s.id}`}
                  >
                    <Ionicons
                      name={s.communityStarred ? 'bookmark' : 'bookmark-outline'}
                      size={14}
                      color={colors.primary}
                    />
                    <Text style={[styles.editButtonText, { color: colors.primary }]}>
                      {togglingStarId === s.id ? '…' : s.communityStarred ? 'Featured' : 'Feature'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => startEdit(s)}
                    style={[styles.editButton, { borderColor: colors.border }]}
                    accessibilityRole="button"
                    testID={`edit-signal-${s.id}`}
                  >
                    <Ionicons name="create-outline" size={14} color={colors.primary} />
                    <Text style={[styles.editButtonText, { color: colors.primary }]}>Edit</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => confirmDelete(s)}
                    disabled={deletingId === s.id}
                    style={[styles.editButton, { borderColor: colors.border }, deletingId === s.id && { opacity: 0.5 }]}
                    accessibilityRole="button"
                    testID={`delete-signal-${s.id}`}
                  >
                    <Ionicons name="trash-outline" size={14} color={colors.destructive} />
                    <Text style={[styles.editButtonText, { color: colors.destructive }]}>
                      {deletingId === s.id ? 'Removing…' : 'Delete'}
                    </Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.statusRow}>
                {STATUS_OPTIONS.map((st) => {
                  const active = s.status === st;
                  const busy = updatingStatusId === s.id;
                  return (
                    <Pressable
                      key={st}
                      onPress={() => void quickStatus(s, st)}
                      disabled={busy}
                      style={[
                        styles.statusChip,
                        {
                          backgroundColor: active ? colors.primary : colors.card,
                          borderColor: active ? colors.primary : colors.border,
                        },
                        busy && { opacity: 0.5 },
                      ]}
                      accessibilityRole="button"
                      testID={`status-${s.id}-${st}`}
                    >
                      <Text style={[styles.statusChipText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                        {st}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Card>
          ))
        )}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

function Segment({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} style={[styles.segment, { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border }]} accessibilityRole="button">
      <Text style={[styles.segmentText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>{label}</Text>
    </Pressable>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const colors = useColors();
  return (
    <View style={styles.selectWrap}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.select, { backgroundColor: colors.card, borderColor: open ? colors.primary : colors.border }]}
        accessibilityRole="button"
      >
        <Text style={[styles.selectText, { color: colors.foreground }]}>{value}</Text>
        <Ionicons name="chevron-down" size={15} color={colors.mutedForeground} />
      </Pressable>

      {/* Modal overlay so the list floats above everything including ScrollView */}
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setOpen(false)} accessibilityRole="button">
          <View style={[styles.optionsList, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalLabel, { color: colors.mutedForeground }]}>{label}</Text>
            {options.map((o) => (
              <Pressable
                key={o}
                onPress={() => { onChange(o); setOpen(false); }}
                style={({ pressed }) => [
                  styles.option,
                  { backgroundColor: o === value ? colors.secondary : 'transparent' },
                  pressed && { opacity: 0.7 },
                ]}
                accessibilityRole="menuitem"
              >
                <Text style={[styles.optionText, { color: o === value ? colors.primary : colors.foreground }]}>{o}</Text>
                {o === value ? <Ionicons name="checkmark" size={15} color={colors.primary} /> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function Field({ label, value, onChangeText, placeholder, multiline = false, keyboardType = 'default' }: { label: string; value: string; onChangeText: (v: string) => void; placeholder: string; multiline?: boolean; keyboardType?: 'default' | 'decimal-pad' }) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.mutedForeground} multiline={multiline} keyboardType={keyboardType} style={[styles.input, multiline && styles.textArea, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, paddingTop: 25, paddingBottom: 50 },
  topBar: { minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  backButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.5, marginBottom: 6 },
  title: { fontSize: 27, fontFamily: 'Inter_700Bold', letterSpacing: -0.7 },
  notice: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginBottom: 14 },
  noticeText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  disclaimer: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginBottom: 22 },
  disclaimerTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', color: '#E2A87A', marginBottom: 4 },
  disclaimerBody: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular', color: '#c4845a' },
  sectionTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', marginBottom: 11, marginTop: 4 },
  scanBox: { borderWidth: 1, borderRadius: 16, borderStyle: 'dashed', padding: 20, alignItems: 'center', gap: 10, marginBottom: 20 },
  scanPreview: { width: '100%', height: 140, borderRadius: 10 },
  scanCaption: { fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 16 },
  scanButton: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
  scanButtonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  success: { borderRadius: 13, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 },
  successText: { color: '#7AE2AA', flex: 1, fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  segmentRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  segment: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  segmentText: { fontSize: 11, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  styleHint: { fontSize: 10, fontFamily: 'Inter_400Regular', lineHeight: 15, marginTop: -10, marginBottom: 16 },
  lockedType: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, marginBottom: 18 },
  lockedTypeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  twoCol: { flexDirection: 'row', gap: 9 },
  threeCol: { flexDirection: 'row', gap: 8 },
  fourCol: { flexDirection: 'row', gap: 7 },
  field: { flex: 1, marginBottom: 13 },
  selectWrap: { flex: 1, marginBottom: 13 },
  fieldLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', marginBottom: 6 },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, fontSize: 12, fontFamily: 'Inter_400Regular' },
  textArea: { minHeight: 104, paddingTop: 12, textAlignVertical: 'top' },
  select: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  optionsList: { width: '100%', borderWidth: 1, borderRadius: 18, overflow: 'hidden', paddingBottom: 6 },
  modalLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.4, textTransform: 'uppercase', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13 },
  optionText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  greeksNote: { borderRadius: 10, padding: 10, marginBottom: 12 },
  greeksNoteText: { fontSize: 10, fontFamily: 'Inter_400Regular', lineHeight: 15 },
  error: { fontSize: 11, fontFamily: 'Inter_600SemiBold', marginBottom: 12, lineHeight: 16 },
  footerNote: { fontSize: 10, lineHeight: 15, textAlign: 'center', fontFamily: 'Inter_400Regular', marginTop: 14, paddingHorizontal: 8 },
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  gateTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', marginTop: 4 },
  gateText: { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 18 },
  gateButton: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10, marginTop: 6 },
  gateButtonText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  editingBanner: { borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 16 },
  editingText: { flex: 1, fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  editingCancel: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  listHeading: { marginTop: 28 },
  signalRow: { marginBottom: 12 },
  signalRowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  signalRowTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  signalAsset: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  signalMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 4 },
  newsAlertNote: { fontSize: 10, fontFamily: 'Inter_600SemiBold', marginTop: 4 },
  rowActions: { flexDirection: 'row', gap: 7 },
  editButton: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 7 },
  editButtonText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  autoBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
  autoBadgeText: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 14 },
  statusChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  statusChipText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
});
