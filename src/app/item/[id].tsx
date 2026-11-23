import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Item } from '../../lib/db';
import { deletePhoto, photoUri, savePhoto } from '../../lib/photos';
import { deriveStatus, statusInfo } from '../../lib/status';
import { colors } from '../../lib/theme';

const UNITS = ['unidade', 'caixa', 'pacote', 'kit'];
type Photo = { name: string | null; tempUri: string | null };
const digits = (t: string) => t.replace(/\D/g, '');

function PhotoField({ label, photo, onChange }: { label: string; photo: Photo; onChange: (p: Photo) => void }) {
  const uri = photo.tempUri ?? photoUri(photo.name);

  const pick = async (source: 'camera' | 'gallery') => {
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7 };
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return Alert.alert('Permissão', 'Permita o uso da câmera para tirar fotos.');
    }
    const res =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
    if (!res.canceled) onChange({ ...photo, tempUri: res.assets[0].uri });
  };

  const choose = () =>
    Alert.alert(label, undefined, [
      { text: 'Câmera', onPress: () => pick('camera') },
      { text: 'Galeria', onPress: () => pick('gallery') },
      ...(uri
        ? [{ text: 'Remover', style: 'destructive' as const, onPress: () => onChange({ name: null, tempUri: null }) }]
        : []),
      { text: 'Cancelar', style: 'cancel' as const },
    ]);

  return (
    <View style={styles.photoBox}>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={choose} style={styles.photo}>
        {uri ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <Text style={styles.photoHint}>Toque para adicionar</Text>
        )}
      </Pressable>
      {uri ? <Text style={styles.link} onPress={choose}>Substituir</Text> : null}
    </View>
  );
}

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const db = useSQLiteContext();
  const router = useRouter();

  const [original, setOriginal] = useState<Item | null>(null);
  const [name, setName] = useState('');
  const [importer, setImporter] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [ref, setRef] = useState('');
  const [requested, setRequested] = useState('');
  const [found, setFound] = useState('0');
  const [absent, setAbsent] = useState(false);
  const [unitChoice, setUnitChoice] = useState('unidade');
  const [customUnit, setCustomUnit] = useState('');
  const [product, setProduct] = useState<Photo>({ name: null, tempUri: null });
  const [reference, setReference] = useState<Photo>({ name: null, tempUri: null });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) return;
    db.getFirstAsync<Item>('SELECT * FROM items WHERE id = ?', Number(id)).then((i) => {
      if (!i) return;
      setOriginal(i);
      setName(i.name);
      setImporter(i.importer ?? '');
      setManufacturer(i.manufacturer ?? '');
      setRef(i.reference_code ?? '');
      setRequested(String(i.requested_qty));
      setFound(String(i.found_qty));
      setAbsent(i.marked_absent === 1);
      if (UNITS.includes(i.unit)) setUnitChoice(i.unit);
      else {
        setUnitChoice('outra');
        setCustomUnit(i.unit);
      }
      setProduct({ name: i.product_photo, tempUri: null });
      setReference({ name: i.reference_photo, tempUri: null });
    });
  }, [db, id, isNew]);

  const requestedN = parseInt(requested, 10) || 0;
  const foundN = parseInt(found, 10) || 0;
  const status = deriveStatus({
    requested_qty: requestedN,
    found_qty: foundN,
    marked_absent: absent ? 1 : 0,
  });

  const setFoundQty = (n: number) => {
    const v = Math.max(0, n);
    setFound(String(v));
    if (v > 0) setAbsent(false);
  };

  const toggleAbsent = () => {
    if (absent) return setAbsent(false);
    const apply = () => {
      setFound('0');
      setAbsent(true);
    };
    if (foundN > 0) {
      Alert.alert('Marcar como não encontrado?', 'A quantidade encontrada será zerada.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', style: 'destructive', onPress: apply },
      ]);
    } else apply();
  };

  const save = async () => {
    const unit = (unitChoice === 'outra' ? customUnit : unitChoice).trim().replace(/\s+/g, ' ');
    if (!name.trim()) return Alert.alert('Atenção', 'Informe o nome do produto.');
    if (requestedN <= 0) return Alert.alert('Atenção', 'A quantidade solicitada deve ser maior que zero.');
    if (!unit) return Alert.alert('Atenção', 'Informe a unidade.');
    const unitFinal = UNITS.find((u) => u.toLowerCase() === unit.toLowerCase()) ?? unit;

    setSaving(true);
    const created: string[] = [];
    try {
      const resolve = async (p: Photo, kind: 'product' | 'reference') => {
        if (!p.tempUri) return p.name;
        const n = await savePhoto(p.tempUri, kind);
        created.push(n);
        return n;
      };
      const pName = await resolve(product, 'product');
      const rName = await resolve(reference, 'reference');
      const vals = [
        name.trim(),
        importer.trim() || null,
        manufacturer.trim() || null,
        ref.trim() || null,
        pName,
        rName,
        requestedN,
        unitFinal,
        absent ? 0 : foundN,
        absent ? 1 : 0,
      ];
      if (isNew) {
        await db.runAsync(
          `INSERT INTO items (name, importer, manufacturer, reference_code, product_photo, reference_photo,
           requested_qty, unit, found_qty, marked_absent) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          vals,
        );
      } else {
        await db.runAsync(
          `UPDATE items SET name=?, importer=?, manufacturer=?, reference_code=?, product_photo=?, reference_photo=?,
           requested_qty=?, unit=?, found_qty=?, marked_absent=? WHERE id=?`,
          [...vals, Number(id)],
        );
        if (original?.product_photo && original.product_photo !== pName) deletePhoto(original.product_photo);
        if (original?.reference_photo && original.reference_photo !== rName) deletePhoto(original.reference_photo);
      }
      router.back();
    } catch {
      created.forEach(deletePhoto);
      setSaving(false);
      Alert.alert('Erro', 'Não foi possível salvar o produto.');
    }
  };

  const remove = () =>
    Alert.alert('Excluir produto?', 'Esta ação não pode ser desfeita.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          await db.runAsync('DELETE FROM items WHERE id = ?', Number(id));
          deletePhoto(original?.product_photo);
          deletePhoto(original?.reference_photo);
          router.back();
        },
      },
    ]);

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: isNew ? 'Novo produto' : 'Produto' }} />

      <View style={styles.photos}>
        <PhotoField label="Foto do produto" photo={product} onChange={setProduct} />
        <PhotoField label="Foto da referência" photo={reference} onChange={setReference} />
      </View>

      <Text style={styles.label}>Nome *</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Nome do produto" />
      <Text style={styles.label}>Referência</Text>
      <TextInput style={styles.input} value={ref} onChangeText={setRef} autoCapitalize="characters" placeholder="Opcional" />
      <Text style={styles.label}>Importador</Text>
      <TextInput style={styles.input} value={importer} onChangeText={setImporter} placeholder="Opcional" />
      <Text style={styles.label}>Fabricante</Text>
      <TextInput style={styles.input} value={manufacturer} onChangeText={setManufacturer} placeholder="Opcional" />

      <Text style={styles.label}>Quantidade solicitada *</Text>
      <TextInput
        style={styles.input}
        value={requested}
        onChangeText={(t) => setRequested(digits(t))}
        keyboardType="number-pad"
        placeholder="0"
      />

      <Text style={styles.label}>Unidade *</Text>
      <View style={styles.chips}>
        {[...UNITS, 'outra'].map((u) => (
          <Pressable key={u} onPress={() => setUnitChoice(u)} style={[styles.chip, unitChoice === u && styles.chipOn]}>
            <Text style={[styles.chipText, unitChoice === u && styles.chipTextOn]}>
              {u === 'outra' ? 'Outra…' : u}
            </Text>
          </Pressable>
        ))}
      </View>
      {unitChoice === 'outra' && (
        <TextInput
          style={styles.input}
          value={customUnit}
          onChangeText={setCustomUnit}
          placeholder="Ex.: fardo, rolo, saco"
        />
      )}

      <View style={styles.foundCard}>
        <Text style={styles.label}>Quantidade encontrada</Text>
        <View style={styles.stepper}>
          <Pressable style={styles.stepBtn} onPress={() => setFoundQty(foundN - 1)}>
            <Text style={styles.stepText}>−</Text>
          </Pressable>
          <TextInput
            style={[styles.input, styles.foundInput]}
            value={found}
            onChangeText={(t) => setFoundQty(parseInt(digits(t), 10) || 0)}
            keyboardType="number-pad"
          />
          <Pressable style={styles.stepBtn} onPress={() => setFoundQty(foundN + 1)}>
            <Text style={styles.stepText}>+</Text>
          </Pressable>
        </View>
        <Text style={styles.unitText}>
          {foundN} de {requestedN} {unitChoice === 'outra' ? customUnit : unitChoice}
        </Text>
        <View style={styles.row}>
          <Pressable style={styles.secondary} onPress={() => setFoundQty(requestedN)}>
            <Text style={styles.secondaryText}>Coletar tudo</Text>
          </Pressable>
          <Pressable style={[styles.secondary, absent && styles.secondaryOn]} onPress={toggleAbsent}>
            <Text style={[styles.secondaryText, absent && styles.secondaryTextOn]}>
              {absent ? 'Desmarcar ausente' : 'Não encontrado'}
            </Text>
          </Pressable>
        </View>
        <Text style={[styles.badge, { backgroundColor: statusInfo[status].color }]}>
          {statusInfo[status].label}
        </Text>
      </View>

      <Pressable style={[styles.primary, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
        <Text style={styles.primaryText}>Salvar</Text>
      </Pressable>
      {!isNew && (
        <Pressable style={styles.deleteBtn} onPress={remove}>
          <Text style={styles.deleteText}>Excluir produto</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48 },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginTop: 12, marginBottom: 4 },
  input: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: colors.text,
  },
  photos: { flexDirection: 'row', gap: 12 },
  photoBox: { flex: 1 },
  photo: {
    height: 140, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1,
    borderColor: colors.border, borderStyle: 'dashed', overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  photoHint: { color: colors.muted, fontSize: 13 },
  link: { color: colors.primaryDark, marginTop: 4, textAlign: 'center', fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  foundCard: {
    marginTop: 20, padding: 14, borderRadius: 14, backgroundColor: '#EAF4FC',
    borderWidth: 1, borderColor: colors.border,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  stepText: { color: '#fff', fontSize: 28, marginTop: -2 },
  foundInput: { flex: 1, textAlign: 'center', fontSize: 22, fontWeight: '700' },
  unitText: { textAlign: 'center', color: colors.text, marginTop: 8 },
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  secondary: {
    flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.primary,
    alignItems: 'center', backgroundColor: colors.card,
  },
  secondaryOn: { backgroundColor: colors.danger, borderColor: colors.danger },
  secondaryText: { color: colors.primaryDark, fontWeight: '600' },
  secondaryTextOn: { color: '#fff' },
  badge: {
    alignSelf: 'center', color: '#fff', fontWeight: '700', paddingHorizontal: 14,
    paddingVertical: 4, borderRadius: 10, overflow: 'hidden', marginTop: 12,
  },
  primary: { marginTop: 24, backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  deleteBtn: { marginTop: 14, alignItems: 'center', padding: 10 },
  deleteText: { color: colors.danger, fontWeight: '600' },
});
