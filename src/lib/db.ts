import type { SQLiteDatabase } from 'expo-sqlite';

export type Product = {
  id: number;
  name: string;
  importer: string | null;
  manufacturer: string | null;
  reference_code: string | null;
  product_photo: string | null;
  reference_photo: string | null;
};

export type CollectionItem = {
  product_id: number;
  requested_qty: number;
  observation: string | null;
  unit: string;
  found_qty: number;
  marked_absent: number;
};

export type CollectionEntry = Product & Omit<CollectionItem, 'product_id'>;

async function createTables(db: SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE products (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL CHECK (length(trim(name)) > 0),
      importer TEXT,
      manufacturer TEXT,
      reference_code TEXT,
      product_photo TEXT,
      reference_photo TEXT
    );
    CREATE TABLE collection_items (
      product_id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
      requested_qty INTEGER NOT NULL CHECK (requested_qty > 0),
      observation TEXT,
      unit TEXT NOT NULL CHECK (length(trim(unit)) > 0),
      found_qty INTEGER NOT NULL DEFAULT 0 CHECK (found_qty >= 0),
      marked_absent INTEGER NOT NULL DEFAULT 0 CHECK (marked_absent IN (0, 1)),
      CHECK (NOT (marked_absent = 1 AND found_qty > 0))
    );
  `);
}

export async function migrate(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA foreign_keys = ON');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;

  if (version < 1) {
    await db.withTransactionAsync(async () => {
      await createTables(db);
      await db.execAsync('PRAGMA user_version = 4');
    });
    return;
  }

  if (version === 1) {
    await db.withTransactionAsync(async () => {
      await createTables(db);
      await db.execAsync(`
        INSERT INTO products (id, name, importer, manufacturer, reference_code,
          product_photo, reference_photo)
        SELECT id, name, importer, manufacturer, reference_code,
          product_photo, reference_photo
        FROM items;
        INSERT INTO collection_items (product_id, requested_qty, unit, found_qty, marked_absent)
        SELECT id, requested_qty, unit, found_qty, marked_absent
        FROM items;
        DROP TABLE items;
        PRAGMA user_version = 4;
      `);
    });
    return;
  }

  if (version === 2) {
    await db.execAsync('PRAGMA foreign_keys = OFF');
    try {
      await db.withTransactionAsync(async () => {
        await db.execAsync(`
          CREATE TABLE products_v3 (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL CHECK (length(trim(name)) > 0),
            importer TEXT,
            manufacturer TEXT,
            reference_code TEXT,
            product_photo TEXT,
            reference_photo TEXT
          );
          CREATE TABLE collection_items_v3 (
            product_id INTEGER PRIMARY KEY REFERENCES products_v3(id) ON DELETE CASCADE,
            requested_qty INTEGER NOT NULL CHECK (requested_qty > 0),
            observation TEXT,
            unit TEXT NOT NULL CHECK (length(trim(unit)) > 0),
            found_qty INTEGER NOT NULL DEFAULT 0 CHECK (found_qty >= 0),
            marked_absent INTEGER NOT NULL DEFAULT 0 CHECK (marked_absent IN (0, 1)),
            CHECK (NOT (marked_absent = 1 AND found_qty > 0))
          );
          INSERT INTO products_v3 (id, name, importer, manufacturer, reference_code,
            product_photo, reference_photo)
          SELECT id, name, importer, manufacturer, reference_code, product_photo, reference_photo
          FROM products;
          INSERT INTO collection_items_v3 (product_id, requested_qty, observation, unit, found_qty, marked_absent)
          SELECT c.product_id, c.requested_qty, NULL, p.unit, c.found_qty, c.marked_absent
          FROM collection_items c
          JOIN products p ON p.id = c.product_id;
          DROP TABLE collection_items;
          DROP TABLE products;
          ALTER TABLE products_v3 RENAME TO products;
          ALTER TABLE collection_items_v3 RENAME TO collection_items;
          PRAGMA user_version = 4;
        `);
      });
    } finally {
      await db.execAsync('PRAGMA foreign_keys = ON');
    }
    return;
  }

  if (version === 3) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        ALTER TABLE collection_items ADD COLUMN observation TEXT;
        PRAGMA user_version = 4;
      `);
    });
  }
}
