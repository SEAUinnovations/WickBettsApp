import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LearningLevel } from './learningData';

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
