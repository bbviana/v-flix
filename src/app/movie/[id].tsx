import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { posterUrl } from '@/api/tmdb';
import { getMovieDetail, type MovieDetail } from '@/db/queries';
import { formatRating, formatRuntime, formatVotes } from '@/lib/format';
import { colors, radius, spacing, type } from '@/theme';

export default function MovieScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [movie, setMovie] = useState<MovieDetail | null>(null);

  useEffect(() => {
    getMovieDetail(db, Number(id)).then(setMovie);
  }, [db, id]);

  const backdrop = movie?.backdrop_path ?? movie?.poster_path;
  const heroHeight = Math.round((width * 9) / 16);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxxl }}>
        <View style={{ height: heroHeight }}>
          {backdrop && (
            <Image
              source={posterUrl(backdrop, movie?.backdrop_path ? 'w1280' : 'w780')}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={250}
            />
          )}
          {/* Funde a imagem com o fundo para o título "nascer" dela. */}
          <LinearGradient
            colors={['transparent', colors.background]}
            locations={[0.45, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>

        {movie && <MovieBody movie={movie} />}
      </ScrollView>

      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        style={({ pressed }) => [styles.back, { top: insets.top + spacing.sm }, pressed && { opacity: 0.6 }]}
      >
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
    </View>
  );
}

function MovieBody({ movie }: { movie: MovieDetail }) {
  const meta = [movie.year, formatRuntime(movie.runtime)].filter(Boolean).join(' · ');
  const showOriginal = movie.original_title && movie.original_title !== movie.title;

  const facts: [string, string][] = [];
  if (movie.director) facts.push(['Direção', movie.director]);
  if (movie.cast.length) facts.push(['Elenco', movie.cast.join(', ')]);
  if (movie.genres.length) facts.push(['Gênero', movie.genres.join(', ')]);
  if (movie.countries.length) facts.push([movie.countries.length > 1 ? 'Países' : 'País', movie.countries.join(', ')]);
  if (showOriginal) facts.push(['Título original', movie.original_title!]);

  return (
    <View style={styles.body}>
      <View style={styles.header}>
        <Text style={styles.title}>{movie.title}</Text>
        <View style={styles.metaRow}>
          {!!meta && <Text style={styles.meta}>{meta}</Text>}
          {movie.certification_br && <Text style={styles.cert}>{movie.certification_br}</Text>}
        </View>
      </View>

      {(movie.rating !== null || movie.oscar_won !== null) && (
        <View style={styles.highlights}>
          {movie.rating !== null && (
            <View style={styles.highlight}>
              <Text style={styles.highlightValue}>
                {formatRating(movie.rating)}
                <Text style={styles.highlightScale}> / 10</Text>
              </Text>
              <Text style={styles.highlightLabel}>
                <Text style={{ color: colors.imdb }}>IMDb</Text> · {formatVotes(movie.votes ?? 0)} votos
              </Text>
            </View>
          )}
          {movie.oscar_won !== null && (
            <View style={styles.highlight}>
              <Text style={[styles.highlightValue, { color: colors.oscar }]}>
                {movie.oscar_won ? 'Vencedor' : 'Indicado'}
              </Text>
              <Text style={styles.highlightLabel}>
                Oscar de Melhor Filme{movie.oscar_year ? ` · ${movie.oscar_year}` : ''}
              </Text>
            </View>
          )}
        </View>
      )}

      {movie.providers.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Disponível em</Text>
          <View style={styles.providers}>
            {movie.providers.map((p) => (
              <View key={p.id} style={styles.provider}>
                <Image source={posterUrl(p.logo_path, 'w92')} style={styles.providerLogo} />
                <Text style={styles.providerName}>{p.name}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {movie.overview && <Text style={styles.overview}>{movie.overview}</Text>}

      {facts.length > 0 && (
        <View style={styles.facts}>
          {facts.map(([label, value]) => (
            <View key={label} style={styles.fact}>
              <Text style={styles.factLabel}>{label}</Text>
              <Text style={styles.factValue}>{value}</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.credits}>
        Dados de disponibilidade: JustWatch.{'\n'}
        Este produto usa a API da TMDB, mas não é endossado nem certificado pela TMDB.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  back: {
    position: 'absolute',
    left: spacing.lg,
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { paddingHorizontal: spacing.xl, gap: spacing.xxl, marginTop: -spacing.xl },
  header: { gap: spacing.sm },
  title: { ...type.largeTitle, color: colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  meta: { ...type.subhead, color: colors.textSecondary },
  cert: {
    ...type.caption,
    color: colors.textSecondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.textTertiary,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  highlights: { flexDirection: 'row', gap: spacing.xxl },
  highlight: { gap: 2 },
  highlightValue: { ...type.title, color: colors.text },
  highlightScale: { ...type.subhead, color: colors.textTertiary },
  highlightLabel: { ...type.footnote, color: colors.textSecondary },
  section: { gap: spacing.md },
  sectionLabel: { ...type.footnote, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6 },
  providers: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  provider: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  providerLogo: { width: 28, height: 28, borderRadius: radius.sm },
  providerName: { ...type.subhead, color: colors.text },
  overview: { ...type.body, color: colors.text },
  facts: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  fact: {
    flexDirection: 'row',
    gap: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  factLabel: { ...type.subhead, color: colors.textTertiary, width: 104 },
  factValue: { ...type.subhead, color: colors.text, flex: 1 },
  credits: { ...type.caption, fontWeight: '400', color: colors.textTertiary, lineHeight: 16 },
});
