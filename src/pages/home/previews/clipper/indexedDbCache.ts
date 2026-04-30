const dbName = "openlist-video-editor"
const dbVersion = 1

export const flvIndexStoreName = "flv-indexes"

let dbPromise: Promise<IDBDatabase> | undefined

export const openVideoEditorDb = () => {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, dbVersion)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(flvIndexStoreName)) {
        const store = db.createObjectStore(flvIndexStoreName, {
          keyPath: "key",
        })
        store.createIndex("updatedAt", "updatedAt")
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

export const withStore = async <T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
) => {
  const db = await openVideoEditorDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const request = run(tx.objectStore(storeName))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    tx.onerror = () => reject(tx.error)
  })
}

export const deleteFromStore = (storeName: string, key: string) =>
  withStore(storeName, "readwrite", (store) => store.delete(key))
