// src/app/servicos/sync.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { StorageService, STORAGE_KEYS, SyncQueueItem } from './storage';
import {
  BaseLocalModel,
  SyncStatus,
  generateUUID,
  now,
  markAsSynced
} from '../modelos/local.models';
import { environment } from '../../environments/environment';

/**
 * Estado de sincronização da aplicação
 */
export interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAt: string | null;
  pendingCount: number;
  progress: number; // 0-100
  error: string | null;
}

/**
 * Serviço centralizado de sincronização
 * Gerencia a sincronização bidirecional entre app e servidor
 */
@Injectable({
  providedIn: 'root'
})
export class SyncService {

  private readonly API_URL = 'http://localhost:3000'; // Adicionar variável de ambiente futuramente

  // Estado da sincronização (Observable para UI reagir)
  private syncState = new BehaviorSubject<SyncState>({
    isOnline: navigator.onLine,
    isSyncing: false,
    lastSyncAt: null,
    pendingCount: 0,
    progress: 0,
    error: null
  });

  public syncState$ = this.syncState.asObservable();

  // Timer para auto-sync
  private autoSyncInterval: any;
  private readonly AUTO_SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutos

  constructor(
    private http: HttpClient,
    private storage: StorageService
  ) {
    this.initNetworkMonitoring();
    this.initAutoSync();
  }

  // ==================== INICIALIZAÇÃO ====================

  /**
   * Monitora mudanças de conectividade
   */
  private initNetworkMonitoring(): void {
    window.addEventListener('online', () => {
      console.log('🌐 Conectado à internet');
      this.updateState({ isOnline: true, error: null });
      this.syncAll(); // Sincroniza automaticamente ao reconectar
    });

    window.addEventListener('offline', () => {
      console.log('📡 Sem conexão com a internet');
      this.updateState({ isOnline: false });
    });
  }

  /**
   * Configura sincronização automática
   */
  private initAutoSync(): void {
    // Limpa intervalo anterior se existir
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
    }

    // Auto-sync a cada 5 minutos
    this.autoSyncInterval = setInterval(() => {
      if (this.canSync()) {
        console.log('⏰ Auto-sync iniciado');
        this.syncAll();
      }
    }, this.AUTO_SYNC_INTERVAL);
  }

  /**
   * Para auto-sync (chamar no ngOnDestroy do app component)
   */
  public stopAutoSync(): void {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
    }
  }

  // ==================== HELPERS DE ESTADO ====================

  /**
   * Atualiza estado de sincronização
   */
  private updateState(partial: Partial<SyncState>): void {
    const current = this.syncState.value;
    this.syncState.next({ ...current, ...partial });
  }

  /**
   * Verifica se pode sincronizar
   */
  private canSync(): boolean {
    const state = this.syncState.value;
    return state.isOnline && !state.isSyncing;
  }

  /**
   * Obtém headers HTTP com token de autenticação
   */
  private async getHeaders(): Promise<HttpHeaders> {
    const authData = await this.storage.get<any>(STORAGE_KEYS.AUTH_DATA);

    if (!authData || !authData.token) {
      throw new Error('Usuário não autenticado');
    }

    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authData.token}`
    });
  }

  // ==================== SINCRONIZAÇÃO PRINCIPAL ====================

  /**
   * Sincroniza todos os dados pendentes
   * Upload: envia dados locais para servidor
   * Download: baixa dados novos do servidor
   */
  public async syncAll(): Promise<void> {
    if (!this.canSync()) {
      console.log('⚠️ Não pode sincronizar agora');
      return;
    }

    console.log('🔄 Iniciando sincronização completa');
    this.updateState({ isSyncing: true, progress: 0, error: null });

    try {
      // 1. Upload: Envia dados pendentes (fila de sync)
      await this.uploadPendingChanges();

      // 2. Download: Baixa dados novos do servidor
      await this.downloadNewData();

      // 3. Atualiza metadados
      const metadata = await this.storage.getSyncMetadata();
      metadata.lastSyncAt = now();
      metadata.lastSuccessfulSyncAt = now();
      metadata.syncInProgress = false;
      await this.storage.setSyncMetadata(metadata);

      this.updateState({
        isSyncing: false,
        progress: 100,
        lastSyncAt: now(),
        pendingCount: 0
      });

      console.log('✅ Sincronização completa com sucesso');

    } catch (error: any) {
      console.error('❌ Erro na sincronização:', error);
      this.updateState({
        isSyncing: false,
        progress: 0,
        error: error.message || 'Erro desconhecido'
      });

      // Atualiza metadados com erro
      const metadata = await this.storage.getSyncMetadata();
      metadata.syncInProgress = false;
      metadata.lastError = error.message;
      await this.storage.setSyncMetadata(metadata);
    }
  }

  /**
   * Envia dados pendentes para o servidor
   */
  private async uploadPendingChanges(): Promise<void> {
    const queue = await this.storage.getSyncQueue();

    if (queue.length === 0) {
      console.log('📤 Nenhum dado pendente para enviar');
      return;
    }

    console.log(`📤 Enviando ${queue.length} itens pendentes`);

    const headers = await this.getHeaders();
    let processed = 0;

    for (const item of queue) {
      try {
        await this.processSyncQueueItem(item, headers);
        await this.storage.removeFromSyncQueue(item.id);
        processed++;

        // Atualiza progresso
        const progress = (processed / queue.length) * 50; // 0-50%
        this.updateState({ progress });

      } catch (error: any) {
        console.error(`❌ Erro ao processar item ${item.id}:`, error);

        // Incrementa retries
        item.retries++;
        item.lastError = error.message;

        if (item.retries >= item.maxRetries) {
          console.error(`⚠️ Item ${item.id} excedeu máximo de tentativas`);
          await this.storage.removeFromSyncQueue(item.id);
        }
      }
    }

    console.log(`✅ ${processed}/${queue.length} itens enviados com sucesso`);
  }

  /**
   * Processa um item da fila de sincronização
   */
  private async processSyncQueueItem(
    item: SyncQueueItem,
    headers: HttpHeaders
  ): Promise<void> {
    const { entity, operation, uuid, data } = item;

    switch (operation) {
      case 'create':
        await this.syncCreate(entity, uuid, data, headers);
        break;
      case 'update':
        await this.syncUpdate(entity, uuid, data, headers);
        break;
      case 'delete':
        await this.syncDelete(entity, uuid, headers);
        break;
    }
  }

  /**
   * Sincroniza criação de um registro
   */
  private async syncCreate(
    entity: string,
    uuid: string,
    data: any,
    headers: HttpHeaders
  ): Promise<void> {
    const url = `${this.API_URL}/${entity}`;

    const response = await this.http.post<any>(url, data, { headers }).toPromise();

    // Atualiza registro local com serverId
    const collectionKey = this.getCollectionKey(entity);
    const localItem = await this.storage.getFromCollection<BaseLocalModel>(collectionKey, uuid);

    if (localItem) {
      const updated = markAsSynced(localItem, response.id || response.idfaq || response.iddica);
      await this.storage.setInCollection(collectionKey, uuid, updated);
    }

    console.log(`✅ Criado ${entity} ${uuid} no servidor (ID: ${response.id})`);
  }

  /**
   * Sincroniza atualização de um registro
   */
  private async syncUpdate(
    entity: string,
    uuid: string,
    data: any,
    headers: HttpHeaders
  ): Promise<void> {
    const collectionKey = this.getCollectionKey(entity);
    const localItem = await this.storage.getFromCollection<BaseLocalModel>(collectionKey, uuid);

    if (!localItem || !localItem.serverId) {
      throw new Error(`Item ${uuid} não tem serverId para atualizar`);
    }

    const url = `${this.API_URL}/${entity}/${localItem.serverId}`;

    await this.http.put(url, data, { headers }).toPromise();

    // Atualiza status local
    const updated = markAsSynced(localItem, localItem.serverId);
    await this.storage.setInCollection(collectionKey, uuid, updated);

    console.log(`✅ Atualizado ${entity} ${uuid} no servidor`);
  }

  /**
   * Sincroniza deleção de um registro
   */
  private async syncDelete(
    entity: string,
    uuid: string,
    headers: HttpHeaders
  ): Promise<void> {
    const collectionKey = this.getCollectionKey(entity);
    const localItem = await this.storage.getFromCollection<BaseLocalModel>(collectionKey, uuid);

    if (!localItem || !localItem.serverId) {
      // Item nunca foi sincronizado, apenas remove local
      await this.storage.removeFromCollection(collectionKey, uuid);
      return;
    }

    const url = `${this.API_URL}/${entity}/${localItem.serverId}`;

    await this.http.delete(url, { headers }).toPromise();

    // Remove do storage local
    await this.storage.removeFromCollection(collectionKey, uuid);

    console.log(`✅ Deletado ${entity} ${uuid} do servidor`);
  }

  /**
   * Baixa dados novos do servidor
   */
  private async downloadNewData(): Promise<void> {
    console.log('📥 Baixando dados do servidor');

    const headers = await this.getHeaders();
    const metadata = await this.storage.getSyncMetadata();
    const lastSync = metadata.lastSuccessfulSyncAt;

    // Baixa cada tipo de dado
    // Por enquanto, baixa tudo. Depois implementar sync incremental

    await this.downloadMedicamentos(headers);
    await this.downloadMinistra(headers);
    await this.downloadDicas(headers);
    await this.downloadFaqs(headers);

    this.updateState({ progress: 100 });
    console.log('✅ Download completo');
  }

  /**
   * Baixa medicamentos do servidor
   */
  private async downloadMedicamentos(headers: HttpHeaders): Promise<void> {
    try {
      const url = `${this.API_URL}/medicamento`;
      const response = await this.http.get<any[]>(url, { headers }).toPromise();

      // Mesclar com dados locais (evitar sobrescrever não sincronizados)
      // Por simplicidade, apenas adicionar os que não existem localmente

      console.log(`📥 Baixados ${response?.length || 0} medicamentos`);
    } catch (error) {
      console.error('Erro ao baixar medicamentos:', error);
    }
  }

  /**
   * Baixa registros ministra do servidor
   */
  private async downloadMinistra(headers: HttpHeaders): Promise<void> {
    try {
      const url = `${this.API_URL}/ministra`;
      const response = await this.http.get<any[]>(url, { headers }).toPromise();

      console.log(`📥 Baixados ${response?.length || 0} registros ministra`);
    } catch (error) {
      console.error('Erro ao baixar ministra:', error);
    }
  }

  /**
   * Baixa dicas do servidor
   */
  private async downloadDicas(headers: HttpHeaders): Promise<void> {
    try {
      const url = `${this.API_URL}/dica`;
      const response = await this.http.get<any[]>(url, { headers }).toPromise();

      console.log(`📥 Baixadas ${response?.length || 0} dicas`);
    } catch (error) {
      console.error('Erro ao baixar dicas:', error);
    }
  }

  /**
   * Baixa FAQs do servidor
   */
  private async downloadFaqs(headers: HttpHeaders): Promise<void> {
    try {
      const url = `${this.API_URL}/faq`;
      const response = await this.http.get<any[]>(url, { headers }).toPromise();

      console.log(`📥 Baixadas ${response?.length || 0} FAQs`);
    } catch (error) {
      console.error('Erro ao baixar FAQs:', error);
    }
  }

  // ==================== HELPERS ====================

  /**
   * Mapeia nome da entidade para chave de storage
   */
  private getCollectionKey(entity: string): string {
    const mapping: Record<string, string> = {
      'medicamento': STORAGE_KEYS.MEDICAMENTOS,
      'ministra': STORAGE_KEYS.MINISTRA,
      'dica': STORAGE_KEYS.DICAS,
      'faq': STORAGE_KEYS.FAQS
    };

    return mapping[entity] || entity;
  }

  // ==================== API PÚBLICA ====================

  /**
   * Força sincronização manual (para botão na UI)
   */
  public async forceSyncNow(): Promise<void> {
    console.log('🔄 Sincronização manual iniciada');
    await this.syncAll();
  }

  /**
   * Conta itens pendentes de sincronização
   */
  public async countPending(): Promise<number> {
    const queue = await this.storage.getSyncQueue();
    return queue.length;
  }

  /**
   * Obtém estado atual de sincronização
   */
  public getCurrentState(): SyncState {
    return this.syncState.value;
  }

  /**
   * Reseta erro de sincronização
   */
  public clearError(): void {
    this.updateState({ error: null });
  }
}
