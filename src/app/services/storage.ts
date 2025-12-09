import { Injectable } from '@angular/core';
import { Storage } from '@ionic/storage-angular';

/**
 * Serviço base para armazenamento local
 * Gerencia Ionic Storage com tipagem e métodos utilitários
 */
@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private _storage: Storage | null = null;
  private initialized = false;

  constructor(private storage: Storage) {}

  /**
   * Inicializa o storage (DEVE ser chamado no app.component)
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    const storage = await this.storage.create();
    this._storage = storage;
    this.initialized = true;
    console.log('✅ Storage inicializado');
  }

  /**
   * Garante que o storage foi inicializado
   */
  private async ensureInitialized(): Promise<Storage> {
    if (!this._storage) {
      await this.init();
    }
    return this._storage!;
  }

  // ==================== MÉTODOS BÁSICOS ====================

  /**
   * Salva um valor no storage
   */
  async set<T>(key: string, value: T): Promise<void> {
    const storage = await this.ensureInitialized();
    await storage.set(key, value);
  }

  /**
   * Recupera um valor do storage
   */
  async get<T>(key: string): Promise<T | null> {
    const storage = await this.ensureInitialized();
    return await storage.get(key);
  }

  /**
   * Remove um item do storage
   */
  async remove(key: string): Promise<void> {
    const storage = await this.ensureInitialized();
    await storage.remove(key);
  }

  /**
   * Limpa todo o storage
   */
  async clear(): Promise<void> {
    const storage = await this.ensureInitialized();
    await storage.clear();
    console.log('🗑️ Storage limpo');
  }

  /**
   * Lista todas as chaves
   */
  async keys(): Promise<string[]> {
    const storage = await this.ensureInitialized();
    return await storage.keys();
  }

  /**
   * Verifica se uma chave existe
   */
  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  // ==================== MÉTODOS PARA COLEÇÕES ====================

  /**
   * Salva uma coleção de itens (ex: lista de medicamentos)
   * @param collectionKey - Chave da coleção (ex: 'medicamentos')
   * @param items - Objeto com UUID como chave
   */
  async setCollection<T>(
    collectionKey: string,
    items: Record<string, T>
  ): Promise<void> {
    await this.set(collectionKey, items);
  }

  /**
   * Recupera uma coleção inteira
   */
  async getCollection<T>(collectionKey: string): Promise<Record<string, T>> {
    const collection = await this.get<Record<string, T>>(collectionKey);
    return collection || {};
  }

  /**
   * Adiciona ou atualiza um item na coleção
   */
  async setInCollection<T>(
    collectionKey: string,
    itemId: string,
    item: T
  ): Promise<void> {
    const collection = await this.getCollection<T>(collectionKey);
    collection[itemId] = item;
    await this.setCollection(collectionKey, collection);
  }

  /**
   * Busca um item específico na coleção
   */
  async getFromCollection<T>(
    collectionKey: string,
    itemId: string
  ): Promise<T | null> {
    const collection = await this.getCollection<T>(collectionKey);
    return collection[itemId] || null;
  }

  /**
   * Remove um item da coleção
   */
  async removeFromCollection(
    collectionKey: string,
    itemId: string
  ): Promise<void> {
    const collection = await this.getCollection(collectionKey);
    delete collection[itemId];
    await this.setCollection(collectionKey, collection);
  }

  /**
   * Retorna todos os itens de uma coleção como array
   */
  async getCollectionAsArray<T>(collectionKey: string): Promise<T[]> {
    const collection = await this.getCollection<T>(collectionKey);
    return Object.values(collection);
  }

  /**
   * Filtra itens de uma coleção
   */
  async filterCollection<T>(
    collectionKey: string,
    predicate: (item: T) => boolean
  ): Promise<T[]> {
    const items = await this.getCollectionAsArray<T>(collectionKey);
    return items.filter(predicate);
  }

  /**
   * Conta itens em uma coleção
   */
  async countCollection(collectionKey: string): Promise<number> {
    const collection = await this.getCollection(collectionKey);
    return Object.keys(collection).length;
  }

  // ==================== MÉTODOS PARA FILA DE SYNC ====================

  /**
   * Adiciona item à fila de sincronização
   */
  async addToSyncQueue(item: SyncQueueItem): Promise<void> {
    const queue = await this.get<SyncQueueItem[]>('sync_queue') || [];
    queue.push(item);
    await this.set('sync_queue', queue);
  }

  /**
   * Recupera fila de sincronização
   */
  async getSyncQueue(): Promise<SyncQueueItem[]> {
    return await this.get<SyncQueueItem[]>('sync_queue') || [];
  }

  /**
   * Remove item da fila de sincronização
   */
  async removeFromSyncQueue(itemId: string): Promise<void> {
    let queue = await this.getSyncQueue();
    queue = queue.filter(item => item.id !== itemId);
    await this.set('sync_queue', queue);
  }

  /**
   * Limpa fila de sincronização
   */
  async clearSyncQueue(): Promise<void> {
    await this.set('sync_queue', []);
  }

  /**
   * Remove itens de ministra inválidos da fila (com medicamento_uuid ao invés de medicamento_idmedicamento)
   */
  async cleanInvalidMinistraQueue(): Promise<void> {
    let queue = await this.getSyncQueue();
    const originalLength = queue.length;

    queue = queue.filter(item => {
      // Remove itens de ministra que usam medicamento_uuid ao invés de medicamento_idmedicamento
      if (item.entity === 'ministra' && item.operation === 'create') {
        if (item.data && 'medicamento_uuid' in item.data && !('medicamento_idmedicamento' in item.data)) {
          console.log('🗑️ Removendo item inválido da fila:', item.id);
          return false; // Remove
        }
      }
      return true; // Mantém
    });

    if (queue.length < originalLength) {
      await this.set('sync_queue', queue);
      console.log(`✅ Removidos ${originalLength - queue.length} itens inválidos da fila`);
    }
  }

  // ==================== MÉTODOS PARA METADADOS ====================

  /**
   * Salva metadados de sincronização
   */
  async setSyncMetadata(metadata: SyncMetadata): Promise<void> {
    await this.set('sync_metadata', metadata);
  }

  /**
   * Recupera metadados de sincronização
   */
  async getSyncMetadata(): Promise<SyncMetadata> {
    return await this.get<SyncMetadata>('sync_metadata') || {
      lastSyncAt: null,
      lastSuccessfulSyncAt: null,
      syncInProgress: false,
      pendingCount: 0
    };
  }

  // ==================== UTILITÁRIOS ====================

  /**
   * Exporta todos os dados do storage (para debug/backup)
   */
  async exportAll(): Promise<Record<string, any>> {
    const storage = await this.ensureInitialized();
    const keys = await storage.keys();
    const data: Record<string, any> = {};

    for (const key of keys) {
      data[key] = await storage.get(key);
    }

    return data;
  }

  /**
   * Importa dados para o storage (para restore)
   */
  async importAll(data: Record<string, any>): Promise<void> {
    const storage = await this.ensureInitialized();

    for (const [key, value] of Object.entries(data)) {
      await storage.set(key, value);
    }

    console.log('📥 Dados importados com sucesso');
  }

  /**
   * Calcula tamanho aproximado do storage (em bytes)
   */
  async getStorageSize(): Promise<number> {
    const data = await this.exportAll();
    const jsonString = JSON.stringify(data);
    return new Blob([jsonString]).size;
  }

  /**
   * Limpa dados antigos (ex: mais de 30 dias)
   */
  async cleanOldData(daysOld: number = 30): Promise<number> {
    let cleanedCount = 0;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    // Implementar lógica específica por tipo de dado
    // Por enquanto, apenas exemplo
    console.log(`🧹 Limpando dados anteriores a ${cutoffDate.toISOString()}`);

    return cleanedCount;
  }
}

// ==================== TIPOS ====================

export interface SyncQueueItem {
  id: string;              // UUID do item na fila
  entity: string;          // 'medicamento', 'ministra', etc
  uuid: string;            // UUID do registro
  operation: 'create' | 'update' | 'delete';
  data: any;               // Dados para enviar
  timestamp: string;       // ISO timestamp
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
  // Coleções de dados
  MEDICAMENTOS: 'medicamentos',
  MINISTRA: 'ministra',
  DICAS: 'dicas',
  FAQS: 'faqs',
  INTERACOES: 'interacoes',

  // Sincronização
  SYNC_QUEUE: 'sync_queue',
  SYNC_METADATA: 'sync_metadata',

  // Autenticação
  AUTH_DATA: 'auth_data',
  USER_DATA: 'user_data',

  // Mapeamento UUID -> Server ID
  ID_MAPPING: 'id_mapping'
} as const;
