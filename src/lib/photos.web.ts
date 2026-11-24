export function photoUri(name?: string | null): string | null {
  return name ?? null;
}

export async function savePhoto(
  tempUri: string,
  _kind: 'product' | 'reference',
): Promise<string> {
  return tempUri;
}

export function deletePhoto(_name?: string | null) {}

export function clearPhotos(): Promise<void> {
  return Promise.resolve();
}
