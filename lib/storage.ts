import { openDB, type DBSchema } from "idb";
import type { PhotoRecord } from "./photo";
interface PhotoDB extends DBSchema {
  photos: { key: string; value: PhotoRecord };
}
export interface CollectionStorage {
  list(): Promise<PhotoRecord[]>;
  add(record: PhotoRecord): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}
export class BrowserCollection implements CollectionStorage {
  private db() {
    return openDB<PhotoDB>("pinfaces-local-v1", 1, {
      upgrade(db) {
        db.createObjectStore("photos", { keyPath: "id" });
      },
    });
  }
  async list() {
    const db = await this.db();
    const tx = db.transaction("photos", "readwrite");
    const all = await tx.store.getAll();
    for (const record of all)
      if (record.expiresAt <= Date.now()) await tx.store.delete(record.id);
    await tx.done;
    return all
      .filter((r) => r.expiresAt > Date.now())
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  async add(record: PhotoRecord) {
    await this.list();
    const db = await this.db();
    const tx = db.transaction("photos", "readwrite");
    if ((await tx.store.count()) >= 100) {
      tx.abort();
      await tx.done.catch(() => {});
      throw new Error(
        "Your collection is full. Delete a photo before adding another.",
      );
    }
    await tx.store.add(record);
    await tx.done;
  }
  async remove(id: string) {
    const db = await this.db();
    await db.delete("photos", id);
  }
  async clear() {
    const db = await this.db();
    await db.clear("photos");
  }
}
