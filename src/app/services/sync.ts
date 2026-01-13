import { Injectable, Injector, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { StorageService, STORAGE_KEYS, SyncQueueItem } from './storage';
import {
  BaseLocalModel,
  SyncStatus,
  generateUUID,
  now,
  markAsSynced
} from '../models/local.models';
import { environment } from '../../environments/environment';
import { MedicamentoService } from './medicamento';
import { AuthService } from './auth';
import { FaqService } from './faq';
import { InteracaoService } from './interacao';
import { DicaService } from './dica';

/**
 * Estado de sincronização da aplicação
 */
export interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAt: string | null;
  pendingCount: number;
  progress: number;
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
  private http = inject(HttpClient);
  private storage = inject(StorageService);
  private medicamentoService = inject(MedicamentoService);
  private authService = inject(AuthService);
  private faqService = inject(FaqService);
  private interacaoService = inject(InteracaoService);
  private dicaService = inject(DicaService);
  private injector = inject(Injector);


  private readonly API_URL = environment.apiUrl;

  private syncState = new BehaviorSubject<SyncState>({
    isOnline: navigator.onLine,
    isSyncing: false,
    lastSyncAt: null,
    pendingCount: 0,
    progress: 0,
    error: null
  });

  public syncState$ = this.syncState.asObservable();

  private autoSyncInterval: any;
  private readonly AUTO_SYNC_INTERVAL = 5 * 60 * 1000;
  private _ministraService: any; // Lazy loaded para evitar dependência circular

  constructor() {
    this.initNetworkMonitoring();
    this.initAuthMonitoring();
  }

  private initAuthMonitoring(): void {
    this.authService.isAuthenticated$.subscribe(isAuthenticated => {
      if (isAuthenticated) {
        console.log('🔑 Usuário autenticado, iniciando sincronização.');
        this.syncAll();
        this.initAutoSync();
      } else {
        console.log('🔒 Usuário deslogado, parando auto-sync.');
        this.stopAutoSync();
      }
    });
  }

  // ==================== INICIALIZAÇÃO ====================

  /**
   * Monitora mudanças de conectividade
   */
  private initNetworkMonitoring(): void {
    window.addEventListener('online', () => {
      console.log('🌐 Conectado à internet');
      this.updateState({ isOnline: true, error: null });
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
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
    }
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
   * Notifica que houve mudança nos dados locais e tenta sincronizar imediatamente
   */
  public notifyDataChanged(): void {
    if (this.canSync()) {
      console.log('🔔 Dados alterados, tentando sincronizar imediatamente...');
      this.syncAll();
    } else {
      console.log('⏳ Dados alterados, mas sem conexão ou já sincronizando. Aguardando auto-sync.');
    }
  }

  /**
   * Obtém headers HTTP com token de autenticação
   */
  private async getHeaders(): Promise<HttpHeaders> {
    const authData = await this.storage.get<any>(STORAGE_KEYS.AUTH_DATA);
    if (!authData || !authData.accessToken) {
      throw new Error('Usuário não autenticado');
    }
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authData.accessToken}`
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
      await this.uploadPendingChanges();
      await this.downloadNewData();

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

      // **ADIÇÃO: Se o erro for de autenticação, desloga o usuário**
      if (error && error.message === 'Usuário não autenticado') {
        await this.authService.logout();
      }

      this.updateState({
        isSyncing: false,
        progress: 0,
        error: error.message || 'Erro desconhecido'
      });

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
      return;
    }
    const headers = await this.getHeaders();
    let processed = 0;
    for (const item of queue) {
      try {
        await this.processSyncQueueItem(item, headers);
        await this.storage.removeFromSyncQueue(item.id);
        processed++;
        const progress = (processed / queue.length) * 50;
        this.updateState({ progress });
      } catch (error: any) {
        item.retries++;
        item.lastError = error.message;
        if (item.retries >= item.maxRetries) {
          await this.storage.removeFromSyncQueue(item.id);
        }
      }
    }
  }

  private async processSyncQueueItem(item: SyncQueueItem, headers: HttpHeaders): Promise<void> {
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

  private async syncCreate(entity: string, uuid: string, data: any, headers: HttpHeaders): Promise<void> {
    const url = `${this.API_URL}/${entity}`;
    console.log(`📤 POST ${url}`, data);

    try {
      const response = await this.http.post<any>(url, data, { headers }).toPromise();
      const collectionKey = this.getCollectionKey(entity);

      // Re-fetch item to ensure we have the latest version (avoid overwriting concurrent local updates)
      const localItem = await this.storage.getFromCollection<BaseLocalModel>(collectionKey, uuid);

      if (localItem) {
        // Determina o serverId baseado na entidade
        const serverId = response.idministra || response.idmedicamento || response.idfaq || response.iddica || response.id;

        if (serverId) {
          const updated = markAsSynced(localItem, serverId);
          await this.storage.setInCollection(collectionKey, uuid, updated);
          console.log(`✅ ${entity} ${uuid} sincronizado com serverId: ${serverId}`);
        } else {
          console.warn(`⚠️ Resposta do servidor para ${entity} não retornou ID.`, response);
        }
      } else {
        console.warn(`⚠️ Item local ${uuid} não encontrado após syncCreate.`);
      }
    } catch (error) {
      console.error(`❌ Falha no POST ${entity}:`, error);
      throw error;
    }
  }

  private async syncUpdate(entity: string, uuid: string, data: any, headers: HttpHeaders): Promise<void> {
    const collectionKey = this.getCollectionKey(entity);
    const localItem = await this.storage.getFromCollection<any>(collectionKey, uuid);

    let url: string;

    // Interações usam URL especial com dois IDs: /interacao/:medId1/:medId2
    if (entity === 'interacao') {
      if (!localItem?.serverIds?.idmedicamento1 || !localItem?.serverIds?.idmedicamento2) {
        throw new Error(`Interação ${uuid} não tem serverIds para atualizar`);
      }
      url = `${this.API_URL}/${entity}/${localItem.serverIds.idmedicamento1}/${localItem.serverIds.idmedicamento2}`;
    } else {
      if (!localItem || !localItem.serverId) {
        throw new Error(`Item ${uuid} não tem serverId para atualizar`);
      }
      url = `${this.API_URL}/${entity}/${localItem.serverId}`;
    }

    await this.http.put(url, data, { headers }).toPromise();
    const updated = markAsSynced(localItem, localItem.serverId);
    await this.storage.setInCollection(collectionKey, uuid, updated);
  }

  private async syncDelete(entity: string, uuid: string, headers: HttpHeaders): Promise<void> {
    const collectionKey = this.getCollectionKey(entity);
    const localItem = await this.storage.getFromCollection<any>(collectionKey, uuid);

    let url: string;

    // Interações usam URL especial com dois IDs: /interacao/:medId1/:medId2
    if (entity === 'interacao') {
      if (!localItem?.serverIds?.idmedicamento1 || !localItem?.serverIds?.idmedicamento2) {
        await this.storage.removeFromCollection(collectionKey, uuid);
        return;
      }
      url = `${this.API_URL}/${entity}/${localItem.serverIds.idmedicamento1}/${localItem.serverIds.idmedicamento2}`;
    } else {
      if (!localItem || !localItem.serverId) {
        await this.storage.removeFromCollection(collectionKey, uuid);
        return;
      }
      url = `${this.API_URL}/${entity}/${localItem.serverId}`;
    }

    await this.http.delete(url, { headers }).toPromise();
    await this.storage.removeFromCollection(collectionKey, uuid);
  }

  private async downloadNewData(): Promise<void> {
    console.log('📥 Baixando dados do servidor');
    const headers = await this.getHeaders();
    await this.downloadMedicamentos(headers);
    await this.downloadMinistra(headers);
    await this.downloadDicas(headers);
    await this.downloadFaqs(headers);
    await this.downloadInteracoes(headers);
    this.updateState({ progress: 100 });
    console.log('✅ Download completo');
  }

  private async downloadMedicamentos(headers: HttpHeaders): Promise<void> {
    try {
      const url = `${this.API_URL}/medicamento`;
      const response = await this.http.get<any[]>(url, { headers }).toPromise();
      if (response) {
        await this.medicamentoService.mesclarDoServidor(response);
        console.log(`📥 Baixados ${response.length} medicamentos`);
      }
    } catch (error) {
      console.error('Erro ao baixar medicamentos:', error);
    }
  }

  private async downloadMinistra(headers: HttpHeaders): Promise<void> {
    try {
      const url = `${this.API_URL}/ministra`;
      const response = await this.http.get<any[]>(url, { headers }).toPromise();
      if (response) {
        // Lazy load MinistraService para evitar dependência circular
        if (!this._ministraService) {
          const { MinistraService } = await import('./ministra');
          this._ministraService = this.injector.get(MinistraService);
        }
        await this._ministraService.mesclarDoServidor(response);
        console.log(`📥 Baixados ${response.length} registros ministra`);
      }
    } catch (error) {
      console.error('Erro ao baixar ministra:', error);
    }
  }

  private async downloadDicas(headers: HttpHeaders): Promise<void> {
    try {
      const url = `${this.API_URL}/dica`;
      const response = await this.http.get<any[]>(url, { headers }).toPromise();
      if (response) {
        await this.dicaService.mesclarDoServidor(response);
        console.log(`📥 Baixadas ${response.length} dicas`);
      }
    } catch (error) {
      console.error('Erro ao baixar dicas:', error);
    }
  }

  private async downloadFaqs(headers: HttpHeaders): Promise<void> {
    try {
      const url = `${this.API_URL}/faq`;
      const response = await this.http.get<any[]>(url, { headers }).toPromise();
      if (response) {
        await this.faqService.mesclarDoServidor(response);
        console.log(`📥 Baixadas ${response.length} FAQs`);
      }
    } catch (error) {
      console.error('Erro ao baixar FAQs:', error);
    }
  }

  private async downloadInteracoes(headers: HttpHeaders): Promise<void> {
    try {
      const url = `${this.API_URL}/interacao`;
      const response = await this.http.get<any[]>(url, { headers }).toPromise();
      if (response) {
        await this.interacaoService.mesclarDoServidor(response);
        console.log(`📥 Baixadas ${response.length} interações`);
      }
    } catch (error) {
      console.error('Erro ao baixar interações:', error);
    }
  }

  private getCollectionKey(entity: string): string {
    const mapping: Record<string, string> = {
      'medicamento': STORAGE_KEYS.MEDICAMENTOS,
      'ministra': STORAGE_KEYS.MINISTRA,
      'dica': STORAGE_KEYS.DICAS,
      'faq': STORAGE_KEYS.FAQS
    };
    return mapping[entity] || entity;
  }

  public async forceSyncNow(): Promise<void> {
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
