import { Injectable } from '@angular/core';
import { Storage } from '@ionic/storage-angular';

/**
 * Serviço base para armazenamento local
 * Gerencia Ionic Storage com inicialização automática e segura.
 */
@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private _storage: Storage | null = null;
  private readonly initializationDone: Promise<void>;

  constructor(private storage: Storage) {
    // A inicialização agora é uma Promise que resolve quando o storage está pronto.
    this.initializationDone = this.init();
  }

  /**
   * Inicializa o storage. Este é agora um método privado chamado pelo construtor.
   */
  private async init(): Promise<void> {
    try {
      const storage = await this.storage.create();
      this._storage = storage;
      console.log('✅ Storage inicializado');
    } catch (error) {
      console.error('❌ Erro ao inicializar o Storage:', error);
    }
  }

  /**
   * Garante que o storage foi inicializado antes de o usar.
   */
  private async getStorage(): Promise<Storage> {
    await this.initializationDone;
    if (!this._storage) {
      throw new Error('Storage não foi inicializado corretamente.');
    }
    return this._storage;
  }

  // ==================== MÉTODOS BÁSICOS ====================

  async set<T>(key: string, value: T): Promise<void> {
    const storage = await this.getStorage();
    await storage.set(key, value);
  }

  async get<T>(key: string): Promise<T | null> {
    const storage = await this.getStorage();
    return await storage.get(key);
  }

  async remove(key: string): Promise<void> {
    const storage = await this.getStorage();
    await storage.remove(key);
  }

  async clear(): Promise<void> {
    const storage = await this.getStorage();
    await storage.clear();
    console.log('🗑️ Storage limpo');
  }

  async keys(): Promise<string[]> {
    const storage = await this.getStorage();
    return await storage.keys();
  }

  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  // ==================== MÉTODOS PARA COLEÇÕES ====================

  async setCollection<T>(
    collectionKey: string,
    items: Record<string, T>
  ): Promise<void> {
    await this.set(collectionKey, items);
  }

  async getCollection<T>(collectionKey: string): Promise<Record<string, T>> {
    const collection = await this.get<Record<string, T>>(collectionKey);
    return collection || {};
  }

  async setInCollection<T>(
    collectionKey: string,
    itemId: string,
    item: T
  ): Promise<void> {
    const collection = await this.getCollection<T>(collectionKey);
    collection[itemId] = item;
    await this.setCollection(collectionKey, collection);
  }

  async getFromCollection<T>(
    collectionKey: string,
    itemId: string
  ): Promise<T | null> {
    const collection = await this.getCollection<T>(collectionKey);
    return collection[itemId] || null;
  }

  async removeFromCollection(
    collectionKey: string,
    itemId: string
  ): Promise<void> {
    const collection = await this.getCollection(collectionKey);
    delete collection[itemId];
    await this.setCollection(collectionKey, collection);
  }

  async getCollectionAsArray<T>(collectionKey: string): Promise<T[]> {
    const collection = await this.getCollection<T>(collectionKey);
    return Object.values(collection);
  }

  async filterCollection<T>(
    collectionKey: string,
    predicate: (item: T) => boolean
  ): Promise<T[]> {
    const items = await this.getCollectionAsArray<T>(collectionKey);
    return items.filter(predicate);
  }

  async countCollection(collectionKey: string): Promise<number> {
    const collection = await this.getCollection(collectionKey);
    return Object.keys(collection).length;
  }

  // ==================== MÉTODOS PARA FILA DE SYNC ====================

  async addToSyncQueue(item: SyncQueueItem): Promise<void> {
    const queue = await this.get<SyncQueueItem[]>('sync_queue') || [];
    queue.push(item);
    await this.set('sync_queue', queue);
  }

  async getSyncQueue(): Promise<SyncQueueItem[]> {
    return await this.get<SyncQueueItem[]>('sync_queue') || [];
  }

  async removeFromSyncQueue(itemId: string): Promise<void> {
    let queue = await this.getSyncQueue();
    queue = queue.filter(item => item.id !== itemId);
    await this.set('sync_queue', queue);
  }

  async clearSyncQueue(): Promise<void> {
    await this.set('sync_queue', []);
  }

  // ==================== MÉTODOS PARA METADADOS ====================

  async setSyncMetadata(metadata: SyncMetadata): Promise<void> {
    await this.set('sync_metadata', metadata);
  }

  async getSyncMetadata(): Promise<SyncMetadata> {
    return await this.get<SyncMetadata>('sync_metadata') || {
      lastSyncAt: null,
      lastSuccessfulSyncAt: null,
      syncInProgress: false,
      pendingCount: 0
    };
  }

  // ==================== UTILITÁRIOS ====================

  async exportAll(): Promise<Record<string, any>> {
    const storage = await this.getStorage();
    const keys = await storage.keys();
    const data: Record<string, any> = {};

    for (const key of keys) {
      data[key] = await storage.get(key);
    }

    return data;
  }

  async importAll(data: Record<string, any>): Promise<void> {
    const storage = await this.getStorage();

    for (const [key, value] of Object.entries(data)) {
      await storage.set(key, value);
    }

    console.log('📥 Dados importados com sucesso');
  }

  async getStorageSize(): Promise<number> {
    const data = await this.exportAll();
    const jsonString = JSON.stringify(data);
    return new Blob([jsonString]).size;
  }

  async cleanOldData(daysOld: number = 30): Promise<number> {
    let cleanedCount = 0;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    console.log(`🧹 Limpando dados anteriores a ${cutoffDate.toISOString()}`);

    return cleanedCount;
  }
}

// ==================== TIPOS ====================

export interface SyncQueueItem {
  id: string;
  entity: string;
  uuid: string;
  operation: 'create' | 'update' | 'delete';
  data: any;
  timestamp: string;
  retries: number;
  maxRetries: number;
  lastError?: string;
}

export interface SyncMetadata {
  lastSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
  syncInProgress: boolean;
  pendingCount: number;
  lastError?: string;
}

// ==================== CHAVES DE STORAGE ====================

export const STORAGE_KEYS = {
  MEDICAMENTOS: 'medicamentos',
  MINISTRA: 'ministra',
  DICAS: 'dicas',
  FAQS: 'faqs',
  INTERACOES: 'interacoes',
  SYNC_QUEUE: 'sync_queue',
  SYNC_METADATA: 'sync_metadata',
  AUTH_DATA: 'auth_data',
  USER_DATA: 'user_data',
  ID_MAPPING: 'id_mapping'
} as const;
