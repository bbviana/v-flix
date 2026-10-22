import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { posterUrl } from '@/api/tmdb';
import { PosterCard } from '@/components/poster-card';
import { getMovieDetail, type MovieDetail, type PosterItem } from '@/db/queries';
import { getUserState, setInList, setWatched, type UserState } from '@/db/user-lists';
import { getRecommendations } from '@/explore/query';
import { flagEmoji, formatMoney, formatRating, formatRuntime, formatVotes } from '@/lib/format';
import { oscarLabel } from '@/lib/oscar';
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

function UserActions({ tmdbId }: { tmdbId: number }) {
  const db = useSQLiteContext();
  const [state, setState] = useState<UserState | null>(null);

  useEffect(() => {
    getUserState(db, tmdbId).then(setState);
  }, [db, tmdbId]);

  if (!state) return <View style={styles.actions} />;

  const toggleList = async () => {
    await setInList(db, tmdbId, !state.inList);
    setState(await getUserState(db, tmdbId));
  };
  const toggleWatched = async () => {
    await setWatched(db, tmdbId, !state.watched);
    setState(await getUserState(db, tmdbId));
  };

  return (
    <View style={styles.actions}>
      <ActionButton
        icon={state.inList ? 'checkmark' : 'add'}
        label={state.inList ? 'Na lista' : 'Minha lista'}
        active={state.inList}
        onPress={toggleList}
      />
      <ActionButton
        icon={state.watched ? 'eye' : 'eye-outline'}
        label={state.watched ? 'Visto' : 'Marcar como visto'}
        active={state.watched}
        onPress={toggleWatched}
      />
    </View>
  );
}

type ActionButtonProps = {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  active: boolean;
  onPress: () => void;
};

function ActionButton({ icon, label, active, onPress }: ActionButtonProps) {
  const color = active ? colors.background : colors.text;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.action, active && styles.actionActive, pressed && { opacity: 0.75 }]}
    >
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.actionText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const RECOMMENDATION_WIDTH = 104;

/** Recomendações da TMDB que estão nos seus serviços; some quando não há nenhuma. */
function Recommendations({ tmdbId }: { tmdbId: number }) {
  const db = useSQLiteContext();
  const [movies, setMovies] = useState<PosterItem[]>([]);

  useEffect(() => {
    getRecommendations(db, tmdbId).then(setMovies);
  }, [db, tmdbId]);

  if (!movies.length) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Se gostou, veja também</Text>
      <FlatList
        horizontal
        data={movies}
        keyExtractor={(m) => String(m.tmdb_id)}
        renderItem={({ item }) => <PosterCard movie={item} width={RECOMMENDATION_WIDTH} />}
        style={styles.recommendations}
        contentContainerStyle={styles.recommendationsContent}
        showsHorizontalScrollIndicator={false}
        initialNumToRender={4}
      />
    </View>
  );
}

/** Resumo no destaque; com várias indicações, o detalhe fica na seção "Oscar". */
function OscarHighlight({ oscars }: { oscars: MovieDetail['oscars'] }) {
  const wins = oscars.filter((o) => o.won).length;
  const year = oscars.map((o) => o.year).find((y) => y !== null);
  const value = wins > 1 ? `${wins} Oscars` : wins === 1 ? 'Vencedor' : 'Indicado';
  const label =
    oscars.length === 1
      ? `Oscar de ${oscarLabel(oscars[0].category)}`
      : wins === 1
        ? `Oscar de ${oscarLabel(oscars.find((o) => o.won)!.category)}`
        : wins > 1
          ? `de ${oscars.length} indicações`
          : `${oscars.length} indicações ao Oscar`;

  return (
    <View style={styles.highlight}>
      <Text style={[styles.highlightValue, { color: colors.oscar }]}>{value}</Text>
      <Text style={styles.highlightLabel}>
        {label}
        {year ? ` · ${year}` : ''}
      </Text>
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
  if (movie.budget) facts.push(['Orçamento', formatMoney(movie.budget)]);
  // Filmes de streaming com estreia simbólica nos cinemas (ex.: US$ 5 mil para um
  // orçamento de US$ 60 mi) informam bilheterias que mais confundem do que ajudam.
  if (movie.revenue && !(movie.budget && movie.revenue < movie.budget / 100)) {
    facts.push(['Bilheteria', formatMoney(movie.revenue)]);
  }
  if (showOriginal) facts.push(['Título original', movie.original_title!]);

  return (
    <View style={styles.body}>
      <View style={styles.header}>
        <Text style={styles.title}>{movie.title}</Text>
        <View style={styles.metaRow}>
          {!!meta && <Text style={styles.meta}>{meta}</Text>}
          {movie.certification_br && <Text style={styles.cert}>{movie.certification_br}</Text>}
        </View>
        {movie.countries.length > 0 && (
          <Text style={styles.meta}>
            {movie.countries.map((c) => [flagEmoji(c.iso), c.name].filter(Boolean).join(' ')).join('  ·  ')}
          </Text>
        )}
      </View>

      <UserActions tmdbId={movie.tmdb_id} />

      {(movie.rating !== null || movie.oscars.length > 0) && (
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
          {movie.oscars.length > 0 && <OscarHighlight oscars={movie.oscars} />}
        </View>
      )}

      {movie.oscars.length > 1 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Oscar</Text>
          <View>
            {movie.oscars.map((o) => (
              <View key={o.category} style={styles.oscarRow}>
                <Ionicons name={o.won ? 'trophy' : 'trophy-outline'} size={15} color={colors.oscar} />
                <Text style={styles.oscarCategory}>{oscarLabel(o.category)}</Text>
                <Text style={styles.oscarStatus}>{o.won ? 'Vencedor' : 'Indicado'}</Text>
              </View>
            ))}
          </View>
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

      {movie.providers.length === 0 && (
        <Text style={styles.unavailable}>Fora dos seus serviços no momento.</Text>
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

      <Recommendations tmdbId={movie.tmdb_id} />

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
  actions: { flexDirection: 'row', gap: spacing.sm, minHeight: 44 },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  actionActive: { backgroundColor: colors.text },
  actionText: { ...type.subhead, fontWeight: '600' },
  highlights: { flexDirection: 'row', gap: spacing.xxl },
  highlight: { gap: 2 },
  highlightValue: { ...type.title, color: colors.text },
  highlightScale: { ...type.subhead, color: colors.textTertiary },
  highlightLabel: { ...type.footnote, color: colors.textSecondary },
  section: { gap: spacing.md },
  oscarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  oscarCategory: { ...type.subhead, color: colors.text, flex: 1 },
  oscarStatus: { ...type.subhead, color: colors.textSecondary },
  sectionLabel: { ...type.footnote, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6 },
  providers: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  provider: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  providerLogo: { width: 28, height: 28, borderRadius: radius.sm },
  providerName: { ...type.subhead, color: colors.text },
  overview: { ...type.body, color: colors.text },
  unavailable: { ...type.subhead, color: colors.textSecondary },
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
  // A fileira vai de borda a borda, alinhando o primeiro pôster com o texto.
  recommendations: { marginHorizontal: -spacing.xl },
  recommendationsContent: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  credits: { ...type.caption, fontWeight: '400', color: colors.textTertiary, lineHeight: 16 },
});
