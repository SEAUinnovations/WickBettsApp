import { Redirect } from 'expo-router';

export default function SsoCallbackScreen() {
  return <Redirect href="/(tabs)" />;
}