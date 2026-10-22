import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { posterUrl } from '@/api/tmdb';
import type { PosterItem } from '@/db/queries';
import { formatRating } from '@/lib/format';
import { colors, radius, spacing, type } from '@/theme';

type Props = { movie: PosterItem; width: number };

export function PosterCard({ movie, width }: Props) {
  const hasOscar = movie.oscar_won !== null && movie.oscar_won !== undefined;
  const unavailable = movie.available === 0;

  return (
    <Link href={{ pathname: '/movie/[id]', params: { id: movie.tmdb_id } }} asChild>
      <Pressable style={({ pressed }) => [{ width }, pressed && styles.pressed]}>
        <View style={[styles.frame, { width, height: width * 1.5 }]}>
          {movie.poster_path ? (
            <Image
              source={posterUrl(movie.poster_path)}
              style={[StyleSheet.absoluteFill, unavailable && styles.dimmed]}
              transition={200}
            />
          ) : (
            // Sem pôster: o título ocupa o lugar, discreto.
            <Text style={styles.fallback} numberOfLines={4}>
              {movie.title}
            </Text>
          )}

          {hasOscar && (
            <View style={[styles.badge, styles.oscar]}>
              {/* Preenchido = venceu; contorno = indicado. */}
              <Ionicons name={movie.oscar_won ? 'trophy' : 'trophy-outline'} size={11} color={colors.oscar} />
            </View>
          )}

          {unavailable && (
            <View style={[styles.badge, styles.unavailable]}>
              <Text style={styles.badgeText}>Indisponível</Text>
            </View>
          )}

          {!!movie.watched && (
            <View style={[styles.badge, styles.watched]}>
              <Ionicons name="checkmark" size={12} color={colors.text} />
            </View>
          )}

          {movie.rating != null && (
            <View style={[styles.badge, styles.rating]}>
              <Ionicons name="star" size={9} color={colors.imdb} />
              <Text style={styles.ratingText}>{formatRating(movie.rating)}</Text>
            </View>
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
  badge: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  oscar: { top: 6, right: 6, width: 20, height: 20 },
  rating: { bottom: 6, left: 6, paddingHorizontal: 5, height: 18, flexDirection: 'row', gap: 3 },
  ratingText: { fontSize: 11, fontWeight: '600', color: colors.text, letterSpacing: 0.1 },
  watched: { bottom: 6, right: 6, width: 18, height: 18, borderRadius: 9 },
  unavailable: { top: 6, left: 6, paddingHorizontal: 5, height: 18 },
  badgeText: { fontSize: 10, fontWeight: '600', color: colors.textSecondary },
  dimmed: { opacity: 0.4 },
});
