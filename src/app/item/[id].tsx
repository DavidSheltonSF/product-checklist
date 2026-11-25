import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { GestureDetector, GestureHandlerRootView, usePinchGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Product } from '../../lib/db';
import { deletePhoto, photoUri, savePhoto } from '../../lib/photos';
import { colors } from '../../lib/theme';

type Photo = { name: string | null; tempUri: string | null };

function PhotoViewer({ uri, visible, onClose }: { uri: string | null; visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);
  const pinch = usePinchGesture({
    onUpdate: (event) => {
      scale.set(Math.min(5, Math.max(1, scale.get() * event.scaleChange)));
    },
  });
  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));

  useEffect(() => {
    if (visible) scale.set(1);
  }, [scale, uri, visible]);

  return (
    <Modal
      visible={visible && Boolean(uri)}
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.viewer}>
        <GestureDetector gesture={pinch}>
          <Animated.View style={[styles.viewerImage, imageStyle]}>
            {uri ? <Image source={{ uri }} style={styles.viewerImage} contentFit="contain" /> : null}
          </Animated.View>
        </GestureDetector>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fechar visualização da fotografia"
          style={[styles.viewerClose, { top: insets.top + 16, right: insets.right + 16 }]}
          onPress={onClose}
        >
          <Text style={styles.viewerCloseText}>×</Text>
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}

function PhotoField({ label, photo, onChange }: { label: string; photo: Photo; onChange: (p: Photo) => void }) {
  const uri = photo.tempUri ?? photoUri(photo.name);
  const [viewerVisible, setViewerVisible] = useState(false);

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
      { text: uri ? 'Tirar outra foto' : 'Câmera', onPress: () => pick('camera') },
      { text: uri ? 'Selecionar da galeria' : 'Galeria', onPress: () => pick('gallery') },
      ...(uri
        ? [{ text: 'Remover', style: 'destructive' as const, onPress: () => onChange({ name: null, tempUri: null }) }]
        : []),
      { text: 'Cancelar', style: 'cancel' as const },
    ]);

  return (
    <View style={styles.photoBox}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={uri ? `Ampliar ${label.toLowerCase()}` : `Adicionar ${label.toLowerCase()}`}
        onPress={uri ? () => setViewerVisible(true) : choose}
        style={styles.photo}
      >
        {uri ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <Text style={styles.photoHint}>Toque para adicionar</Text>
        )}
      </Pressable>
      {uri ? (
        <View style={styles.photoActions}>
          <Text style={styles.link} onPress={choose}>Substituir</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Opções de ${label.toLowerCase()}`}
            onPress={choose}
            style={styles.photoOptions}
          >
            <Text style={styles.photoOptionsText}>⋯</Text>
          </Pressable>
        </View>
      ) : null}
      <PhotoViewer uri={uri} visible={viewerVisible} onClose={() => setViewerVisible(false)} />
    </View>
  );
}

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const db = useSQLiteContext();
  const router = useRouter();

  const [original, setOriginal] = useState<Product | null>(null);
  const [name, setName] = useState('');
  const [importer, setImporter] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [ref, setRef] = useState('');
  const [product, setProduct] = useState<Photo>({ name: null, tempUri: null });
  const [reference, setReference] = useState<Photo>({ name: null, tempUri: null });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) return;
    db.getFirstAsync<Product>('SELECT * FROM products WHERE id = ?', Number(id)).then((i) => {
      if (!i) return;
      setOriginal(i);
      setName(i.name);
      setImporter(i.importer ?? '');
      setManufacturer(i.manufacturer ?? '');
      setRef(i.reference_code ?? '');
      setProduct({ name: i.product_photo, tempUri: null });
      setReference({ name: i.reference_photo, tempUri: null });
    });
  }, [db, id, isNew]);

  const save = async () => {
    if (!name.trim()) return Alert.alert('Atenção', 'Informe o nome do produto.');

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
      ];
      if (isNew) {
        await db.runAsync(
          `INSERT INTO products (name, importer, manufacturer, reference_code, product_photo, reference_photo)
           VALUES (?,?,?,?,?,?)`,
          vals,
        );
      } else {
        await db.runAsync(
          `UPDATE products SET name=?, importer=?, manufacturer=?, reference_code=?, product_photo=?, reference_photo=?
           WHERE id=?`,
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
          try {
            await db.withTransactionAsync(async () => {
              await db.runAsync('DELETE FROM collection_items WHERE product_id = ?', Number(id));
              await db.runAsync('DELETE FROM products WHERE id = ?', Number(id));
            });
            deletePhoto(original?.product_photo);
            deletePhoto(original?.reference_photo);
            router.back();
          } catch {
            Alert.alert('Erro', 'Não foi possível excluir o produto.');
          }
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
  photoActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 },
  link: { color: colors.primaryDark, textAlign: 'center', fontSize: 13 },
  photoOptions: {
    minWidth: 32, minHeight: 28, alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, backgroundColor: colors.border,
  },
  photoOptionsText: { color: colors.primaryDark, fontSize: 20, lineHeight: 22, fontWeight: '700' },
  viewer: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '100%' },
  viewerClose: {
    position: 'absolute', width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#333', alignItems: 'center', justifyContent: 'center',
  },
  viewerCloseText: { color: '#fff', fontSize: 32, lineHeight: 36 },
  primary: { marginTop: 24, backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  deleteBtn: { marginTop: 14, alignItems: 'center', padding: 10 },
  deleteText: { color: colors.danger, fontWeight: '600' },
});
