/**
 * The custom OAuth exchange-code flow has been replaced by Clerk.
 * This screen is no longer reachable — it redirects to the app home
 * in case any stale deep-links point here.
 */
import { Redirect } from 'expo-router';

export default function AuthCallbackScreen() {
  return <Redirect href="/(tabs)" />;
}
