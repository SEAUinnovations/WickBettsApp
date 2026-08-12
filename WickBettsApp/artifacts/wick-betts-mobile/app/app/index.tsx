import { Redirect } from 'expo-router';

export default function LegacyAppIndexRedirect() {
  return <Redirect href="/(tabs)" />;
}
