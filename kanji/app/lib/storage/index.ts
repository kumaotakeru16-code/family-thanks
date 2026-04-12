/**
 * storage/index.ts
 *
 * アプリ全体で使用するストレージアダプタの export 点。
 *
 * 保存先を切り替えるときはここの import 先を変えるだけでよい:
 *
 *   // 現在: localStorage
 *   export { localStorageAdapter as storageAdapter } from './local-storage-adapter'
 *
 *   // 将来: Supabase（anonymous auth 実装後）
 *   export { cloudStorageAdapter as storageAdapter } from './cloud-storage-adapter'
 *
 * user-settings / organizer-settings / event-store は
 * この index.ts からのみ storageAdapter をインポートする。
 * 保存先の知識はこのファイルだけが持つ。
 */

export { localStorageAdapter as storageAdapter } from './local-storage-adapter'
export { STORAGE_KEYS } from './storage-adapter'
export type { StorageAdapter, StorageKey } from './storage-adapter'
