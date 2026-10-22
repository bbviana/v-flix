import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, ToastAndroid, View } from 'react-native';

import { posterUrl } from '@/api/tmdb';
import type { PosterItem } from '@/db/queries';
import { setInList, setWatched, useUserFlags } from '@/db/user-lists';
import { formatRating } from '@/lib/format';
import { colors, radius, spacing, type } from '@/theme';

type Props = { movie: PosterItem; width: number };

export function PosterCard({ movie, width }: Props) {
  const hasOscar = movie.oscar_won !== null && movie.oscar_won !== undefined;
  const unavailable = movie.available === 0;
  const { watched, inList, onPress, onLongPress } = usePosterActions(movie);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [{ width }, pressed && styles.pressed]}
    >
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

        {/* Visto tem prioridade: marcar como visto já tira da lista. */}
        {watched ? (
          <View style={[styles.badge, styles.corner, styles.watched]}>
            <Ionicons name="checkmark-sharp" size={15} color={colors.background} />
          </View>
        ) : (
          inList && (
            <View style={[styles.badge, styles.corner]}>
              <Ionicons name="bookmark" size={11} color={colors.text} />
            </View>
          )
        )}

        {movie.rating != null && (
          <View style={[styles.badge, styles.rating]}>
            <Ionicons name="star" size={9} color={colors.imdb} />
            <Text style={styles.ratingText}>{formatRating(movie.rating)}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

/** Janela para o segundo toque; o toque simples espera esse tempo antes de abrir o Detalhe. */
const DOUBLE_TAP_MS = 250;

/**
 * Atalhos sem abrir o Detalhe: toque duplo marca/desmarca como visto e toque longo
 * põe/tira da Minha lista. O pôster reflete na hora (via `useUserFlags`); o banco é gravado em seguida.
 */
function usePosterActions(movie: PosterItem) {
  const db = useSQLiteContext();
  const { watched, inList } = useUserFlags(movie.tmdb_id, { watched: !!movie.watched, inList: !!movie.in_list });
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => clearTimeout(tapTimer.current ?? undefined), []);

  const toggleWatched = async () => {
    const next = !watched;
    feedback(next ? 'Marcado como visto' : 'Desmarcado como visto');
    await setWatched(db, movie.tmdb_id, next);
  };

  const onPress = () => {
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      toggleWatched();
      return;
    }
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      // push: do Detalhe para outro Detalhe (recomendações) empilha em vez de trocar a tela.
      router.push({ pathname: '/movie/[id]', params: { id: movie.tmdb_id } });
    }, DOUBLE_TAP_MS);
  };

  const onLongPress = async () => {
    const next = !inList;
    feedback(next ? 'Adicionado à Minha lista' : 'Removido da Minha lista');
    await setInList(db, movie.tmdb_id, next);
  };

  return { watched, inList, onPress, onLongPress };
}

function feedback(message: string) {
  if (Platform.OS === 'android') {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Long_Press);
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  fallback: {
    ...type.footnote,
    color: colors.textSecondary,
    textAlign: 'center',
    padding: spacing.sm,
  },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  badge: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  oscar: { top: 6, right: 6, width: 20, height: 20 },
  rating: {
    bottom: 6,
    left: 6,
    paddingHorizontal: 5,
    height: 18,
    flexDirection: 'row',
    gap: 3,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: 0.1,
  },
  corner: { bottom: 6, right: 6, width: 22, height: 22, borderRadius: 11 },
  // Visto em verde sólido: precisa ser percebido de relance numa fileira.
  watched: { backgroundColor: colors.success },
  unavailable: { top: 6, left: 6, paddingHorizontal: 5, height: 18 },
  badgeText: { fontSize: 10, fontWeight: '600', color: colors.textSecondary },
  dimmed: { opacity: 0.4 },
});
