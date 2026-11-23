import { Directory, File, Paths } from 'expo-file-system';

function getPhotoDirectory() {
  return new Directory(Paths.document, 'photos');
}

export function photoUri(name?: string | null): string | null {
  return name ? new File(getPhotoDirectory(), name).uri : null;
}

export async function savePhoto(tempUri: string, kind: 'product' | 'reference'): Promise<string> {
  const dir = getPhotoDirectory();
  if (!dir.exists) dir.create({ intermediates: true });

  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${kind}.jpg`;
  await new File(tempUri).copy(new File(dir, name));
  return name;
}

export function deletePhoto(name?: string | null) {
  if (!name) return;
  try {
    const file = new File(getPhotoDirectory(), name);
    if (file.exists) file.delete();
  } catch {
    // arquivo órfão inofensivo
  }
}
