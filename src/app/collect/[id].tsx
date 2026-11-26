import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { CollectionItem, Product } from '../../lib/db';
import { photoUri } from '../../lib/photos';
import { deriveStatus, statusInfo } from '../../lib/status';
import { colors } from '../../lib/theme';

const digits = (value: string) => value.replace(/\D/g, '');
const UNITS = ['unidade', 'caixa', 'pacote', 'kit'];

export default function CollectProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [existing, setExisting] = useState<CollectionItem | null>(null);
  const [requested, setRequested] = useState('');
  const [observation, setObservation] = useState('');
  const [unitChoice, setUnitChoice] = useState('unidade');
  const [customUnit, setCustomUnit] = useState('');
  const [found, setFound] = useState('0');
  const [absent, setAbsent] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const productRow = await db.getFirstAsync<Product>(
          'SELECT * FROM products WHERE id = ?',
          Number(id),
        );
        if (!productRow) {
          Alert.alert('Produto não encontrado', 'Este produto não está mais no catálogo.');
          router.back();
          return;
        }
        const collectionRow = await db.getFirstAsync<CollectionItem>(
          'SELECT * FROM collection_items WHERE product_id = ?',
          Number(id),
        );
        if (!active) return;
        setProduct(productRow);
        setExisting(collectionRow ?? null);
        if (collectionRow) {
          setRequested(String(collectionRow.requested_qty));
          setObservation(collectionRow.observation ?? '');
          if (UNITS.includes(collectionRow.unit)) setUnitChoice(collectionRow.unit);
          else {
            setUnitChoice('outra');
            setCustomUnit(collectionRow.unit);
          }
          setFound(String(collectionRow.found_qty));
          setAbsent(collectionRow.marked_absent === 1);
        }
        setLoaded(true);
      } catch {
        Alert.alert('Erro', 'Não foi possível carregar o produto.');
        router.back();
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [db, id, router]);

  const requestedN = parseInt(requested, 10) || 0;
  const foundN = parseInt(found, 10) || 0;
  const unit = (unitChoice === 'outra' ? customUnit : unitChoice).trim().replace(/\s+/g, ' ');
  const unitFinal = UNITS.find((candidate) => candidate.toLowerCase() === unit.toLowerCase()) ?? unit;
  const status = requestedN > 0
    ? deriveStatus({
        requested_qty: requestedN,
        found_qty: foundN,
        marked_absent: absent ? 1 : 0,
      })
    : null;

  const setFoundQty = (quantity: number) => {
    const value = Math.max(0, quantity);
    setFound(String(value));
    if (value > 0) setAbsent(false);
  };

  const toggleAbsent = () => {
    if (absent) {
      setAbsent(false);
      return;
    }
    const markAbsent = () => {
      setFound('0');
      setAbsent(true);
    };
    if (foundN > 0) {
      Alert.alert('Marcar como não encontrado?', 'A quantidade encontrada será zerada.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', style: 'destructive', onPress: markAbsent },
      ]);
    } else {
      markAbsent();
    }
  };

  const save = async () => {
    if (requestedN <= 0) {
      Alert.alert('Atenção', 'Informe uma quantidade necessária maior que zero.');
      return;
    }
    if (!unitFinal) {
      Alert.alert('Atenção', 'Informe a unidade da coleta.');
      return;
    }
    setSaving(true);
    try {
      await db.runAsync(
        `INSERT INTO collection_items (product_id, requested_qty, observation, unit, found_qty, marked_absent)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(product_id) DO UPDATE SET
           requested_qty = excluded.requested_qty,
           observation = excluded.observation,
           unit = excluded.unit,
           found_qty = excluded.found_qty,
           marked_absent = excluded.marked_absent`,
        [Number(id), requestedN, observation, unitFinal, absent ? 0 : foundN, absent ? 1 : 0],
      );
      router.back();
    } catch {
      setSaving(false);
      Alert.alert('Erro', 'Não foi possível salvar o item na coleta.');
    }
  };

  const remove = () =>
    Alert.alert('Remover da coleta?', 'O produto continuará salvo no catálogo.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          try {
            await db.runAsync('DELETE FROM collection_items WHERE product_id = ?', Number(id));
            router.back();
          } catch {
            Alert.alert('Erro', 'Não foi possível remover o produto da coleta.');
          }
        },
      },
    ]);

  if (!loaded || !product) return null;

  const productPhoto = photoUri(product.product_photo);
  const referencePhoto = photoUri(product.reference_photo);

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: existing ? 'Editar coleta' : 'Adicionar à coleta' }} />

      <View style={styles.product}>
        {productPhoto ? (
          <Image source={{ uri: productPhoto }} style={styles.photo} contentFit="cover" />
        ) : null}
        {referencePhoto ? (
          <Image source={{ uri: referencePhoto }} style={styles.photo} contentFit="cover" />
        ) : null}
        <View style={styles.productInfo}>
          <Text style={styles.name}>{product.name}</Text>
          {product.reference_code ? (
            <Text style={styles.meta}>Referência: {product.reference_code}</Text>
          ) : null}
        </View>
      </View>

      <Text style={styles.label}>Quantidade necessária *</Text>
      <TextInput
        style={styles.input}
        value={requested}
        onChangeText={(value) => setRequested(digits(value))}
        keyboardType="number-pad"
        placeholder="0"
        accessibilityLabel="Quantidade necessária"
      />

      <Text style={styles.label}>Observação</Text>
      <TextInput
        value={observation}
        onChangeText={setObservation}
        multiline
        numberOfLines={4}
        style={styles.textArea}
      />

      <Text style={styles.label}>Unidade *</Text>
      <View style={styles.chips}>
        {[...UNITS, 'outra'].map((choice) => (
          <Pressable
            key={choice}
            onPress={() => setUnitChoice(choice)}
            style={[styles.chip, unitChoice === choice && styles.chipOn]}
          >
            <Text style={[styles.chipText, unitChoice === choice && styles.chipTextOn]}>
              {choice === 'outra' ? 'Outra…' : choice}
            </Text>
          </Pressable>
        ))}
      </View>
      {unitChoice === 'outra' ? (
        <TextInput
          style={styles.input}
          value={customUnit}
          onChangeText={setCustomUnit}
          placeholder="Ex.: fardo, rolo, saco"
          accessibilityLabel="Outra unidade"
        />
      ) : null}

      {requestedN > 0 ? (
        <View style={styles.foundCard}>
          <Text style={styles.label}>Quantidade encontrada</Text>
          <View style={styles.stepper}>
            <Pressable
              style={styles.stepBtn}
              onPress={() => setFoundQty(foundN - 1)}
              accessibilityRole="button"
              accessibilityLabel="Diminuir quantidade encontrada"
            >
              <Text style={styles.stepText}>−</Text>
            </Pressable>
            <TextInput
              style={[styles.input, styles.foundInput]}
              value={found}
              onChangeText={(value) => setFoundQty(parseInt(digits(value), 10) || 0)}
              keyboardType="number-pad"
              accessibilityLabel="Quantidade encontrada"
            />
            <Pressable
              style={styles.stepBtn}
              onPress={() => setFoundQty(foundN + 1)}
              accessibilityRole="button"
              accessibilityLabel="Aumentar quantidade encontrada"
            >
              <Text style={styles.stepText}>+</Text>
            </Pressable>
          </View>
          <Text style={styles.unitText}>
            {foundN} de {requestedN} {unitFinal || 'unidade'}
          </Text>
          <View style={styles.row}>
            <Pressable style={styles.secondary} onPress={() => setFoundQty(requestedN)}>
              <Text style={styles.secondaryText}>Coletar tudo</Text>
            </Pressable>
            <Pressable
              style={[styles.secondary, absent && styles.secondaryOn]}
              onPress={toggleAbsent}
            >
              <Text style={[styles.secondaryText, absent && styles.secondaryTextOn]}>
                {absent ? 'Desmarcar ausente' : 'Não encontrado'}
              </Text>
            </Pressable>
          </View>
          {status ? (
            <Text style={[styles.badge, { backgroundColor: statusInfo[status].color }]}>
              {statusInfo[status].label}
            </Text>
          ) : null}
        </View>
      ) : null}

      <Pressable
        style={[styles.primary, saving && styles.disabled]}
        onPress={() => void save()}
        disabled={saving}
      >
        <Text style={styles.primaryText}>{existing ? 'Salvar coleta' : 'Adicionar à coleta'}</Text>
      </Pressable>
      {existing ? (
        <Pressable style={styles.deleteBtn} onPress={remove}>
          <Text style={styles.deleteText}>Remover da coleta</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48 },
  product: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photo: { width: 56, height: 56, borderRadius: 8 },
  productInfo: { flex: 1, gap: 3 },
  name: { color: colors.text, fontSize: 17, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: 13 },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginTop: 16, marginBottom: 4 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
  },
  textArea: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize:16,
    color: colors.text,
    height: 100,
    textAlignVertical:  'top'
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  foundCard: {
    marginTop: 20,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#EAF4FC',
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { color: '#fff', fontSize: 28, marginTop: -2 },
  foundInput: { flex: 1, textAlign: 'center', fontSize: 22, fontWeight: '700' },
  unitText: { textAlign: 'center', color: colors.text, marginTop: 8 },
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  secondary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  secondaryOn: { backgroundColor: colors.danger, borderColor: colors.danger },
  secondaryText: { color: colors.primaryDark, fontWeight: '600' },
  secondaryTextOn: { color: '#fff' },
  badge: {
    alignSelf: 'center',
    color: '#fff',
    fontWeight: '700',
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: 12,
  },
  primary: {
    marginTop: 24,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  disabled: { opacity: 0.6 },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  deleteBtn: { marginTop: 14, alignItems: 'center', padding: 10 },
  deleteText: { color: colors.danger, fontWeight: '600' },
});
