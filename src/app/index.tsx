import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, spacing } from '@/theme';

export default function HomeScreen() {
  const db = useSQLiteContext();
  const [version, setVersion] = useState<number | null>(null);

  useEffect(() => {
    db.getFirstAsync<{ user_version: number }>('PRAGMA user_version').then((r) =>
      setVersion(r?.user_version ?? 0),
    );
  }, [db]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>v-flix</Text>
      <Text style={styles.muted}>Banco na versão {version ?? '…'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  title: { color: colors.primary, fontSize: fontSize.xxl, fontWeight: '800' },
  muted: { color: colors.textMuted, fontSize: fontSize.sm },
});
