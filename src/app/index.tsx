import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Item } from '../lib/db';
import { photoUri } from '../lib/photos';
import { deriveStatus, statusInfo } from '../lib/status';
import { colors } from '../lib/theme';

function Thumb({ name }: { name: string | null }) {
  const uri = photoUri(name);
  return uri ? (
    <Image source={{ uri }} style={styles.thumb} contentFit="cover" />
  ) : (
    <View style={[styles.thumb, styles.thumbEmpty]}>
      <Text style={styles.thumbText}>sem foto</Text>
    </View>
  );
}

export default function Home() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Item[]>([]);

  useFocusEffect(
    useCallback(() => {
      db.getAllAsync<Item>('SELECT * FROM items ORDER BY id').then(setItems);
    }, [db]),
  );

  const open = (id: number | 'new') =>
    router.push({ pathname: '/item/[id]', params: { id: String(id) } });

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(i) => String(i.id)}
        contentContainerStyle={items.length ? styles.list : styles.emptyWrap}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Nenhum produto na checklist.{'\n'}Toque em “+” para adicionar.
          </Text>
        }
        renderItem={({ item }) => {
          const s = statusInfo[deriveStatus(item)];
          return (
            <Pressable style={styles.card} onPress={() => open(item.id)}>
              <Thumb name={item.product_photo} />
              <Thumb name={item.reference_photo} />
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
                {item.reference_code ? <Text style={styles.ref}>Ref: {item.reference_code}</Text> : null}
                <Text style={styles.qty}>
                  {item.found_qty} de {item.requested_qty} {item.unit}
                </Text>
                <Text style={[styles.badge, { backgroundColor: s.color }]}>{s.label}</Text>
              </View>
            </Pressable>
          );
        }}
      />
      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 28 }]}
        onPress={() => open('new')}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 12, gap: 10, paddingBottom: 100 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { textAlign: 'center', color: colors.muted, fontSize: 16, lineHeight: 24 },
  card: {
    flexDirection: 'row', backgroundColor: colors.card, borderRadius: 14, padding: 10,
    gap: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  thumb: { width: 64, height: 64, borderRadius: 10 },
  thumbEmpty: { backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  thumbText: { fontSize: 10, color: colors.muted },
  info: { flex: 1, gap: 2, marginLeft: 4 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  ref: { fontSize: 13, color: colors.muted },
  qty: { fontSize: 14, color: colors.text },
  badge: {
    alignSelf: 'flex-start', color: '#fff', fontSize: 12, fontWeight: '600',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: 'hidden', marginTop: 2,
  },
  fab: {
    position: 'absolute', right: 20, bottom: 28, width: 60, height: 60, borderRadius: 30,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', elevation: 4,
  },
  fabText: { color: '#fff', fontSize: 34, marginTop: -2 },
});
