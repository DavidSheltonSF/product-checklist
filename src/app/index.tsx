import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CollectionEntry, Product } from '../lib/db';
import { photoUri } from '../lib/photos';
import { matchesSearch } from '../lib/search';
import { deriveStatus, statusInfo, type Status } from '../lib/status';
import { colors } from '../lib/theme';

type Tab = 'collection' | 'catalog';
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
  const [products, setProducts] = useState<Product[]>([]);
  const [collection, setCollection] = useState<CollectionEntry[]>([]);
  const [tab, setTab] = useState<Tab>('collection');
  const [clearing, setClearing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        try {
          const [savedProducts, activeCollection] = await Promise.all([
            db.getAllAsync<Product>('SELECT * FROM products ORDER BY name COLLATE NOCASE'),
            db.getAllAsync<CollectionEntry>(
              `SELECT p.*, c.requested_qty, c.found_qty, c.marked_absent
               FROM collection_items c
               JOIN products p ON p.id = c.product_id
               ORDER BY p.name COLLATE NOCASE`,
            ),
          ]);
          if (active) {
            setProducts(savedProducts);
            setCollection(activeCollection);
          }
        } catch {
          Alert.alert('Erro', 'Não foi possível carregar os produtos e a coleta.');
        }
      };
      void load();
      return () => {
        active = false;
      };
    }, [db]),
  );

  const statusCounts = useMemo(() => {
    const counts: Record<Status, number> = {
      collected: 0,
      partial: 0,
      pending: 0,
      absent: 0,
    };
    collection.forEach((item) => {
      counts[deriveStatus(item)] += 1;
    });
    return counts;
  }, [collection]);

  const filteredCollection = useMemo(() => {
    const statusMatches = statusFilter === 'all'
      ? collection
      : collection.filter((item) => deriveStatus(item) === statusFilter);
    return statusMatches.filter((item) => matchesSearch(item, searchQuery));
  }, [collection, statusFilter, searchQuery]);

  const filteredProducts = useMemo(
    () => products.filter((item) => matchesSearch(item, searchQuery)),
    [products, searchQuery],
  );
  const visibleItems = tab === 'collection' ? filteredCollection : filteredProducts;
  const hasSearch = searchQuery.trim().length > 0;
  const clearAllFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
  };
  const openProduct = (id: number | 'new') =>
    router.push({ pathname: '/item/[id]', params: { id: String(id) } });
  const openCollectionItem = (id: number) =>
    router.push({ pathname: '/collect/[id]', params: { id: String(id) } });

  const clearCollection = async () => {
    setClearing(true);
    try {
      await db.runAsync('DELETE FROM collection_items');
      setCollection([]);
      setSearchQuery('');
      setStatusFilter('all');
    } catch {
      Alert.alert('Erro', 'Não foi possível limpar a coleta. Tente novamente.');
    } finally {
      setClearing(false);
    }
  };

  const confirmClearCollection = () =>
    Alert.alert(
      'Limpar coleta?',
      'Os itens e o progresso da coleta serão removidos. Os produtos continuarão salvos no catálogo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Limpar coleta', style: 'destructive', onPress: () => void clearCollection() },
      ],
    );

  const renderItem = ({ item }: { item: Product | CollectionEntry }) => {
    const isCollectionEntry = 'requested_qty' in item;
    const status = isCollectionEntry ? statusInfo[deriveStatus(item)] : null;
    const isAlreadyInCollection = collection.some((entry) => entry.id === item.id);

    return (
      <View style={styles.card}>
        <Pressable
          style={styles.cardContent}
          onPress={() =>
            tab === 'collection' ? openCollectionItem(item.id) : openProduct(item.id)
          }
          accessibilityRole="button"
        >
          <Thumb name={item.product_photo} />
          <Thumb name={item.reference_photo} />
          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
            {item.reference_code ? <Text style={styles.ref}>Ref: {item.reference_code}</Text> : null}
            {isCollectionEntry ? (
              <>
                <Text style={styles.qty}>
                  {item.found_qty} de {item.requested_qty} {item.unit}
                </Text>
                {status ? (
                  <Text style={[styles.badge, { backgroundColor: status.color }]}>
                    {status.label}
                  </Text>
                ) : null}
              </>
            ) : null}
          </View>
        </Pressable>
        {tab === 'catalog' ? (
          <Pressable
            style={[styles.catalogAction, isAlreadyInCollection && styles.catalogActionAdded]}
            onPress={() => openCollectionItem(item.id)}
            accessibilityRole="button"
            accessibilityLabel={
              isAlreadyInCollection
                ? `Ajustar ${item.name} na coleta`
                : `Adicionar ${item.name} à coleta`
            }
          >
            <Text
              style={[
                styles.catalogActionText,
                isAlreadyInCollection && styles.catalogActionTextAdded,
              ]}
            >
              {isAlreadyInCollection ? 'Na coleta · ajustar' : 'Adicionar à coleta'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        {([
          ['collection', `Coleta (${collection.length})`],
          ['catalog', `Catálogo (${products.length})`],
        ] as const).map(([value, label]) => {
          const selected = tab === value;
          return (
            <Pressable
              key={value}
              style={[styles.tab, selected && styles.tabSelected]}
              onPress={() => setTab(value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {(tab === 'collection' ? collection.length : products.length) > 0 ? (
        <>
          <View style={[styles.searchBox, searchFocused && styles.searchBoxFocused]}>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={styles.searchInput}
              placeholder="Buscar nome, referência, fabricante..."
              placeholderTextColor={colors.muted}
              accessibilityLabel={tab === 'collection' ? 'Pesquisar na coleta' : 'Pesquisar no catálogo'}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              onSubmitEditing={Keyboard.dismiss}
            />
            {hasSearch ? (
              <Pressable
                onPress={() => setSearchQuery('')}
                accessibilityRole="button"
                accessibilityLabel="Limpar pesquisa"
                style={styles.clearSearchButton}
              >
                <Text style={styles.clearSearchText}>×</Text>
              </Pressable>
            ) : null}
          </View>
          {hasSearch ? (
            <Text accessibilityLiveRegion="polite" style={styles.resultCount}>
              {visibleItems.length} {visibleItems.length === 1 ? 'produto encontrado' : 'produtos encontrados'}
            </Text>
          ) : null}
          {tab === 'collection' ? (
            <View style={styles.filter}>
              <Text style={styles.filterLabel}>Filtrar por status</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filters}
              >
                {(['all', ...statusOrder] as const).map((filter) => {
                  const label = filter === 'all' ? 'Todos' : statusInfo[filter].label;
                  const count = filter === 'all' ? collection.length : statusCounts[filter];
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
        </>
      ) : null}

      <FlatList
        data={visibleItems}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={visibleItems.length ? styles.list : styles.emptyWrap}
        ListHeaderComponent={
          tab === 'collection' && collection.length > 0 ? (
            <Pressable
              style={[styles.clearButton, clearing && styles.clearButtonDisabled]}
              onPress={confirmClearCollection}
              disabled={clearing}
              accessibilityRole="button"
            >
              <Text style={styles.clearButtonText}>
                {clearing ? 'Limpando...' : 'Limpar coleta'}
              </Text>
            </Pressable>
          ) : undefined
        }
        ListEmptyComponent={
          tab === 'collection' && collection.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.empty}>Sua coleta está vazia.</Text>
              <Text style={styles.emptyHint}>
                Adicione produtos do catálogo e informe a quantidade necessária.
              </Text>
              <Pressable
                onPress={() => setTab('catalog')}
                accessibilityRole="button"
                style={styles.resetFilterButton}
              >
                <Text style={styles.resetFilterText}>Abrir catálogo</Text>
              </Pressable>
            </View>
          ) : tab === 'catalog' && products.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.empty}>Nenhum produto salvo.</Text>
              <Text style={styles.emptyHint}>
                Cadastre produtos para reutilizá-los em futuras coletas.
              </Text>
            </View>
          ) : hasSearch ? (
            <View style={styles.emptyState}>
              <Text style={styles.empty}>Nenhum produto encontrado.</Text>
              <Text style={styles.emptyHint}>Tente outro nome, referência ou fabricante.</Text>
              <Pressable
                onPress={clearAllFilters}
                accessibilityRole="button"
                style={styles.resetFilterButton}
              >
                <Text style={styles.resetFilterText}>Limpar busca e filtros</Text>
              </Pressable>
            </View>
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
        renderItem={renderItem}
      />

      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 28 }]}
        onPress={() => tab === 'collection' ? setTab('catalog') : openProduct('new')}
        accessibilityRole="button"
        accessibilityLabel={tab === 'collection' ? 'Adicionar produtos à coleta' : 'Cadastrar produto'}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabs: { flexDirection: 'row', marginHorizontal: 12, marginTop: 10, gap: 8 },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  tabSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  tabTextSelected: { color: '#fff' },
  searchBox: {
    height: 48,
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 2,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  searchBoxFocused: { borderColor: colors.primary },
  searchInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 14,
    color: colors.text,
    fontSize: 16,
  },
  clearSearchButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  clearSearchText: { color: colors.muted, fontSize: 24, lineHeight: 26 },
  resultCount: { marginHorizontal: 12, marginTop: 6, color: colors.muted, fontSize: 13 },
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
  emptyWrap: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyState: { alignItems: 'center', gap: 8 },
  emptyHint: { textAlign: 'center', color: colors.muted, fontSize: 14 },
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
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardContent: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  thumb: { width: 58, height: 58, borderRadius: 10 },
  thumbEmpty: { backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  thumbText: { fontSize: 10, color: colors.muted },
  info: { flex: 1, gap: 2, marginLeft: 4 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  ref: { fontSize: 13, color: colors.muted },
  qty: { fontSize: 14, color: colors.text },
  badge: {
    alignSelf: 'flex-start',
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 2,
  },
  catalogAction: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.card,
  },
  catalogActionAdded: { backgroundColor: colors.primary, borderColor: colors.primary },
  catalogActionText: { color: colors.primaryDark, fontWeight: '600' },
  catalogActionTextAdded: { color: '#fff' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  fabText: { color: '#fff', fontSize: 34, marginTop: -2 },
});
