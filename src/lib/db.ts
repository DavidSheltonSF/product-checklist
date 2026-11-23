import type { SQLiteDatabase } from 'expo-sqlite';

export type Item = {
  id: number;
  name: string;
  importer: string | null;
  manufacturer: string | null;
  reference_code: string | null;
  product_photo: string | null;
  reference_photo: string | null;
  requested_qty: number;
  unit: string;
  found_qty: number;
  marked_absent: number;
};

export async function migrate(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if ((row?.user_version ?? 0) < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        importer TEXT,
        manufacturer TEXT,
        reference_code TEXT,
        product_photo TEXT,
        reference_photo TEXT,
        requested_qty INTEGER NOT NULL CHECK (requested_qty > 0),
        unit TEXT NOT NULL CHECK (length(trim(unit)) > 0),
        found_qty INTEGER NOT NULL DEFAULT 0 CHECK (found_qty >= 0),
        marked_absent INTEGER NOT NULL DEFAULT 0 CHECK (marked_absent IN (0, 1)),
        CHECK (NOT (marked_absent = 1 AND found_qty > 0))
      );
      PRAGMA user_version = 1;
    `);
  }
}
