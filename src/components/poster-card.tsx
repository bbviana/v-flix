import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { posterUrl } from '@/api/tmdb';
import type { PosterItem } from '@/db/queries';
import { colors, radius, spacing, type } from '@/theme';

type Props = { movie: PosterItem; width: number };

export function PosterCard({ movie, width }: Props) {
  return (
    <Link href={{ pathname: '/movie/[id]', params: { id: movie.tmdb_id } }} asChild>
      <Pressable style={({ pressed }) => [{ width }, pressed && styles.pressed]}>
        <View style={[styles.frame, { width, height: width * 1.5 }]}>
          {movie.poster_path ? (
            <Image source={posterUrl(movie.poster_path)} style={StyleSheet.absoluteFill} transition={200} />
          ) : (
            // Sem pôster: o título ocupa o lugar, discreto.
            <Text style={styles.fallback} numberOfLines={4}>
              {movie.title}
            </Text>
          )}
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  fallback: { ...type.footnote, color: colors.textSecondary, textAlign: 'center', padding: spacing.sm },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});
