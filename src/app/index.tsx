import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Item } from '../lib/db';
import { clearPhotos, photoUri } from '../lib/photos';
import { deriveStatus, statusInfo, type Status } from '../lib/status';
import { colors } from '../lib/theme';

const statusOrder: Status[] = ['pending', 'partial', 'collected', 'absent'];

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
  const [clearing, setClearing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');

  const statusCounts = useMemo(() => {
    const counts: Record<Status, number> = {
      collected: 0,
      partial: 0,
      pending: 0,
      absent: 0,
    };
    items.forEach((item) => {
      counts[deriveStatus(item)] += 1;
    });
    return counts;
  }, [items]);

  const filteredItems = useMemo(
    () =>
      statusFilter === 'all'
        ? items
        : items.filter((item) => deriveStatus(item) === statusFilter),
    [items, statusFilter],
  );

  useFocusEffect(
    useCallback(() => {
      db.getAllAsync<Item>('SELECT * FROM items ORDER BY id').then(setItems);
    }, [db]),
  );

  const open = (id: number | 'new') =>
    router.push({ pathname: '/item/[id]', params: { id: String(id) } });

  const clearList = async () => {
    setClearing(true);
    let photosCleared = false;
    try {
      await clearPhotos();
      photosCleared = true;
      await db.runAsync('DELETE FROM items');
      setItems([]);
    } catch {
      Alert.alert(
        'Erro',
        photosCleared
          ? 'As fotos foram removidas, mas não foi possível apagar os produtos. Tente novamente.'
          : 'Não foi possível remover as fotos. Os produtos não foram apagados.',
      );
    } finally {
      setClearing(false);
    }
  };

  const confirmClearList = () =>
    Alert.alert(
      'Limpar lista?',
      'Todos os produtos e as fotos associadas serão apagados. Esta ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Limpar Lista', style: 'destructive', onPress: () => void clearList() },
      ],
    );

  return (
    <View style={styles.container}>
      {items.length > 0 ? (
        <View style={styles.filter}>
          <Text style={styles.filterLabel}>Filtrar por status</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filters}
          >
            {(['all', ...statusOrder] as const).map((filter) => {
              const label = filter === 'all' ? 'Todos' : statusInfo[filter].label;
              const count = filter === 'all' ? items.length : statusCounts[filter];
              const selected = statusFilter === filter;
              return (
                <Pressable
                  key={filter}
                  style={[styles.filterChip, selected && styles.filterChipSelected]}
                  onPress={() => setStatusFilter(filter)}
                  accessibilityRole="button"
                  accessibilityLabel={`${label}, ${count} ${count === 1 ? 'produto' : 'produtos'}`}
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>
                    {label} ({count})
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
      <FlatList
        data={filteredItems}
        keyExtractor={(i) => String(i.id)}
        contentContainerStyle={filteredItems.length ? styles.list : styles.emptyWrap}
        ListHeaderComponent={
          items.length > 0 ? (
            <Pressable
              style={[styles.clearButton, clearing && styles.clearButtonDisabled]}
              onPress={confirmClearList}
              disabled={clearing}
              accessibilityRole="button"
            >
              <Text style={styles.clearButtonText}>
                {clearing ? 'Limpando...' : 'Limpar Lista'}
              </Text>
            </Pressable>
          ) : undefined
        }
        ListEmptyComponent={
          items.length === 0 ? (
            <Text style={styles.empty}>
              Nenhum produto na checklist.{'\n'}Toque em “+” para adicionar.
            </Text>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.empty}>Nenhum produto com esse status.</Text>
              <Pressable
                onPress={() => setStatusFilter('all')}
                accessibilityRole="button"
                style={styles.resetFilterButton}
              >
                <Text style={styles.resetFilterText}>Ver todos</Text>
              </Pressable>
            </View>
          )
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
  filter: { paddingTop: 10, paddingBottom: 4 },
  filterLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    marginHorizontal: 12,
    marginBottom: 8,
  },
  filters: { paddingHorizontal: 12, gap: 8 },
  filterChip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  filterChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  filterChipTextSelected: { color: '#fff' },
  list: { padding: 12, gap: 10, paddingBottom: 100 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  emptyState: { alignItems: 'center', gap: 8 },
  resetFilterButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  resetFilterText: { color: colors.primaryDark, fontWeight: '600' },
  clearButton: {
    alignSelf: 'flex-end',
    marginBottom: 2,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.card,
  },
  clearButtonDisabled: { opacity: 0.6 },
  clearButtonText: { color: colors.danger, fontWeight: '600' },
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
