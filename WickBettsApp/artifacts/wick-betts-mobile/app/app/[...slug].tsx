import type { Href } from 'expo-router';
import { Redirect, useLocalSearchParams } from 'expo-router';

function mapLegacyPath(slug: string[] | undefined): Href {
  const first = slug?.[0] ?? 'home';

  switch (first) {
    case 'home':
      return '/(tabs)';
    case 'signals':
      return '/(tabs)/signals';
    case 'news':
      return '/(tabs)/news';
    case 'community':
      return '/(tabs)/community';
    case 'profile':
      return '/(tabs)/profile';
    case 'mentorship':
      return '/mentorship';
    case 'admin':
      return slug?.[1] === 'users' ? '/admin/users' : '/admin';
    default:
      return '/(tabs)';
  }
}

export default function LegacyAppRouteRedirect() {
  const params = useLocalSearchParams<{ slug?: string[] }>();
  return <Redirect href={mapLegacyPath(params.slug)} />;
}
