import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LearningLevel, Specialization } from './learningData';

/**
 * On-device progress persistence for the Learning tab, keyed per member so a
 * shared device doesn't mix up two members' progress. Mirrors the web app's
 * localStorage-backed `LearningProgress` shape (see the retired
 * wick-betts/src/App.tsx Learning feature) but async via AsyncStorage.
 */

export interface LearningProgress {
  completedModules: string[];
  completedTracks: LearningLevel[];
  xp: number;
  streakDays: number;
  lastVisit: string | null;
  candleGame: { bestScore: number; bestStreak: number; plays: number };
  triviaGame: { bestScore: number; plays: number };
  tradeSimGame: { bestScore: number; bestStreak: number; plays: number };
  optionsGame: { bestScore: number; bestStreak: number; plays: number };
  /** Funded Combine Prep — bestEquity is the highest paper-account peak ever reached in a single run. */
  fundedGame: { bestEquity: number; bestStreak: number; timesReady: number; plays: number };
  /** Portfolio Allocation Builder — bestScore is the highest single-scenario allocation-quality score (0-100) ever reached. */
  portfolioBuilderGame: { bestScore: number; plays: number };
  /** Risk-Sizing Duel — bestFinalEquityMultiple is the best ending-equity/starting-equity ratio ever reached across a single run's trade sequence. */
  riskDuelGame: { bestFinalEquityMultiple: number; plays: number };
  /** Chart Pattern Recognition Trainer — same shape as the other arcade games above. */
  patternGame: { bestScore: number; bestStreak: number; plays: number };
  /** Last specialization the member had selected on the Learning hub — 'all' shows every track. */
  preferredSpecialization: Specialization | 'all';
}

const LEARNING_STORAGE_PREFIX = 'wb-learning-progress';

export function blankLearningProgress(): LearningProgress {
  return {
    completedModules: [],
    completedTracks: [],
    xp: 0,
    streakDays: 0,
    lastVisit: null,
    candleGame: { bestScore: 0, bestStreak: 0, plays: 0 },
    triviaGame: { bestScore: 0, plays: 0 },
    tradeSimGame: { bestScore: 0, bestStreak: 0, plays: 0 },
    optionsGame: { bestScore: 0, bestStreak: 0, plays: 0 },
    fundedGame: { bestEquity: 0, bestStreak: 0, timesReady: 0, plays: 0 },
    portfolioBuilderGame: { bestScore: 0, plays: 0 },
    riskDuelGame: { bestFinalEquityMultiple: 0, plays: 0 },
    patternGame: { bestScore: 0, bestStreak: 0, plays: 0 },
    preferredSpecialization: 'all',
  };
}

export async function loadLearningProgress(userId: string | undefined): Promise<LearningProgress> {
  const fallback = blankLearningProgress();
  if (!userId) return fallback;
  try {
    const raw = await AsyncStorage.getItem(`${LEARNING_STORAGE_PREFIX}:${userId}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<LearningProgress>;
    return {
      ...fallback,
      ...parsed,
      candleGame: { ...fallback.candleGame, ...parsed.candleGame },
      triviaGame: { ...fallback.triviaGame, ...parsed.triviaGame },
      tradeSimGame: { ...fallback.tradeSimGame, ...parsed.tradeSimGame },
      optionsGame: { ...fallback.optionsGame, ...parsed.optionsGame },
      fundedGame: { ...fallback.fundedGame, ...parsed.fundedGame },
      portfolioBuilderGame: { ...fallback.portfolioBuilderGame, ...parsed.portfolioBuilderGame },
      riskDuelGame: { ...fallback.riskDuelGame, ...parsed.riskDuelGame },
      patternGame: { ...fallback.patternGame, ...parsed.patternGame },
    };
  } catch {
    return fallback;
  }
}

export async function saveLearningProgress(userId: string | undefined, progress: LearningProgress): Promise<void> {
  if (!userId) return;
  try {
    await AsyncStorage.setItem(`${LEARNING_STORAGE_PREFIX}:${userId}`, JSON.stringify(progress));
  } catch {
    // Storage may be unavailable (quota, etc.) — progress just will not persist.
  }
}
