import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Card, PrimaryButton, Screen } from '@/components/WickUI';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { TRIVIA_QUESTIONS, sampleArr, shuffleArr, type TriviaQuestion } from '@/lib/learningData';
import { loadLearningProgress, saveLearningProgress, type LearningProgress } from '@/lib/learningStorage';

const ROUNDS = 8;

export default function TriviaArenaScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user } = useAuth();
  const userId = user?.id;

  const [prevProgress, setPrevProgress] = useState<LearningProgress | null>(null);
  const [order, setOrder] = useState<TriviaQuestion[]>(() => sampleArr(TRIVIA_QUESTIONS, ROUNDS));
  const [round, setRound] = useState(0);
  const [options, setOptions] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [savedXp, setSavedXp] = useState(0);

  const current = order[round];

  useEffect(() => {
    void loadLearningProgress(userId).then(setPrevProgress);
  }, [userId]);

  useEffect(() => {
    if (!current) return;
    setOptions(shuffleArr(current.options));
    setSelected(null);
  }, [round]);

  const pick = (opt: string) => {
    if (selected || !current) return;
    setSelected(opt);
    if (opt === current.correct) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setScore((s) => s + 1);
    } else {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const finishRound = async (finalScore: number) => {
    const xpEarned = finalScore * 12;
    setSavedXp(xpEarned);
    const prev = await loadLearningProgress(userId);
    const next: LearningProgress = {
      ...prev,
      xp: prev.xp + xpEarned,
      completedModules: prev.completedModules.includes('trivia-arena') ? prev.completedModules : [...prev.completedModules, 'trivia-arena'],
      triviaGame: { bestScore: Math.max(prev.triviaGame.bestScore, finalScore), plays: prev.triviaGame.plays + 1 },
    };
    await saveLearningProgress(userId, next);
    setPrevProgress(next);
  };

  const next = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (round + 1 >= order.length) {
      void finishRound(score);
      setFinished(true);
      return;
    }
    setRound((r) => r + 1);
  };

  const playAgain = () => {
    setOrder(sampleArr(TRIVIA_QUESTIONS, ROUNDS));
    setRound(0);
    setScore(0);
    setFinished(false);
    setSelected(null);
  };

  const backRow = (
    <View style={styles.backRow}>
      <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button">
        <Ionicons name="arrow-back" size={21} color={colors.foreground} />
      </Pressable>
      <Text style={[styles.backTitle, { color: colors.foreground }]}>Trivia Arena</Text>
      <View style={{ width: 42 }} />
    </View>
  );

  if (finished) {
    return (
      <Screen contentStyle={styles.content}>
        {backRow}
        <Card style={styles.recapCard}>
          <Ionicons name="ribbon" size={30} color={colors.accent} />
          <Text style={[styles.recapTitle, { color: colors.foreground }]}>Arena cleared.</Text>
          <Text style={[styles.recapBody, { color: colors.mutedForeground }]}>
            You scored <Text style={{ fontFamily: 'Inter_700Bold', color: colors.foreground }}>{score}/{order.length}</Text>.
          </Text>
          <View style={[styles.xpPill, { backgroundColor: colors.secondary }]}>
            <Ionicons name="flash" size={12} color="#FDBA74" />
            <Text style={[styles.xpPillText, { color: '#FDBA74' }]}>+{savedXp} XP earned</Text>
          </View>
          <View style={{ marginTop: 20, alignSelf: 'stretch' }}>
            <PrimaryButton onPress={playAgain} icon="refresh-outline">Play again</PrimaryButton>
          </View>
          {prevProgress ? (
            <Text style={[styles.recapFootnote, { color: colors.mutedForeground }]}>
              Personal best: {Math.max(prevProgress.triviaGame.bestScore, score)}/{order.length}
            </Text>
          ) : null}
        </Card>
      </Screen>
    );
  }

  if (!current) return null;

  return (
    <Screen contentStyle={styles.content}>
      {backRow}
      <Card style={styles.gameCard}>
        <View style={styles.topbar}>
          <Text style={[styles.topbarLabel, { color: colors.mutedForeground }]}>QUESTION {round + 1}/{order.length}</Text>
          <View style={styles.topbarStat}>
            <Ionicons name="trophy-outline" size={12} color={colors.accent} />
            <Text style={[styles.topbarStatText, { color: colors.foreground }]}>{score}</Text>
          </View>
        </View>

        <Text style={[styles.question, { color: colors.foreground }]}>{current.question}</Text>

        <View style={styles.options}>
          {options.map((opt) => {
            const isCorrect = opt === current.correct;
            const isSelected = opt === selected;
            const bg = selected
              ? isCorrect
                ? '#11271E'
                : isSelected
                  ? '#2B1418'
                  : colors.secondary
              : colors.secondary;
            const border = selected ? (isCorrect ? '#7AE2AA' : isSelected ? '#FB7185' : colors.border) : colors.border;
            const fg = selected ? (isCorrect ? '#7AE2AA' : isSelected ? '#FB7185' : colors.mutedForeground) : colors.foreground;
            return (
              <Pressable
                key={opt}
                onPress={() => pick(opt)}
                disabled={!!selected}
                style={[styles.option, { backgroundColor: bg, borderColor: border }]}
                accessibilityRole="button"
              >
                <Text style={[styles.optionText, { color: fg }]}>{opt}</Text>
              </Pressable>
            );
          })}
        </View>

        {selected ? (
          <Pressable onPress={next} style={[styles.nextButton, { backgroundColor: colors.secondary }]} accessibilityRole="button">
            <Text style={[styles.nextButtonText, { color: colors.foreground }]}>
              {round + 1 >= order.length ? 'See results' : 'Next question'}
            </Text>
            <Ionicons name="arrow-forward" size={14} color={colors.foreground} />
          </Pressable>
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 110 },
  backRow: { minHeight: 74, paddingTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  backTitle: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  gameCard: {},
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  topbarLabel: { flex: 1, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  topbarStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  topbarStatText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  question: { fontSize: 16, lineHeight: 22, fontFamily: 'Inter_700Bold', marginBottom: 18 },
  options: { gap: 10 },
  option: { minHeight: 50, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  optionText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  nextButton: { marginTop: 16, minHeight: 50, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  nextButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  recapCard: { alignItems: 'center', paddingVertical: 30, gap: 6 },
  recapTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', marginTop: 8 },
  recapBody: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 12 },
  xpPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginTop: 8 },
  xpPillText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  recapFootnote: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 16, textAlign: 'center' },
});
