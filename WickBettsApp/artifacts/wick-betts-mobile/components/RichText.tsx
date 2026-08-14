import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

/**
 * Renders a string containing simple `**bold**` / `_italic_` markers as a
 * single <Text> with nested styled spans. Used across the Learning tab's
 * lesson content so key terms can still be emphasized without needing full
 * HTML/JSX bodies like the web app used.
 */
export function RichText({ text, style, boldStyle }: { text: string; style?: StyleProp<TextStyle>; boldStyle?: StyleProp<TextStyle> }) {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).filter((p) => p.length > 0);
  return (
    <Text style={style}>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <Text key={i} style={[{ fontFamily: 'Inter_700Bold' }, boldStyle]}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        if (part.startsWith('_') && part.endsWith('_')) {
          return (
            <Text key={i} style={{ fontStyle: 'italic' }}>
              {part.slice(1, -1)}
            </Text>
          );
        }
        return <Text key={i}>{part}</Text>;
      })}
    </Text>
  );
}
