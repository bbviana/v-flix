import { Link, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getCatalogSummary } from '@/db/queries';
import { colors, fontSize, radius, spacing } from '@/theme';

// Tela provisória: a Início com fileiras chega no passo 8.
export default function HomeScreen() {
  const db = useSQLiteContext();
  const [total, setTotal] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      getCatalogSummary(db).then((s) => setTotal(s.total));
    }, [db]),
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>v-flix</Text>
      <Text style={styles.muted}>
        {total === null ? '…' : total === 0 ? 'Nenhum filme ainda.' : `${total.toLocaleString('pt-BR')} filmes no catálogo`}
      </Text>
      <Link href="/sync" asChild>
        <Pressable style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}>
          <Text style={styles.buttonText}>Sincronizar</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  title: { color: colors.primary, fontSize: fontSize.xxl, fontWeight: '800' },
  muted: { color: colors.textMuted, fontSize: fontSize.sm },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
  },
  buttonText: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
});
