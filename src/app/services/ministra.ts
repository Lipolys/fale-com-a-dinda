import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { StorageService, STORAGE_KEYS } from './storage';
import { AuthService } from './auth';
import { MedicamentoService } from './medicamento';
import {
  MinistraLocal,
  CriarMinistraLocalDTO,
  createBaseModel,
  generateUUID,
  now,
  markAsUpdated,
  markAsDeleted,
  SyncStatus
} from '../models/local.models';

/**
 * Service para gerenciar as ministrações (medicamentos do cliente)
 * com suporte offline-first.
 */
@Injectable({
  providedIn: 'root'
})
export class MinistraService {

  // Observable para componentes reagirem a mudanças
  private ministraSubject = new BehaviorSubject<MinistraLocal[]>([]);
  public ministra$ = this.ministraSubject.asObservable();
  private clienteUuid: string | null = null;

  constructor(
    private storage: StorageService,
    private authService: AuthService,
    private medicamentoService: MedicamentoService
  ) {
    // Limpa itens inválidos da fila de sincronização ao iniciar
    this.storage.cleanInvalidMinistraQueue().catch(err =>
      console.error('Erro ao limpar fila:', err)
    );

    // Monitora mudanças de autenticação para recarregar dados
    this.authService.isAuthenticated$.subscribe(async (isAuthenticated) => {
      if (isAuthenticated) {
        this.clienteUuid = await this.authService.getCurrentUserUuid();
        await this.carregarMinistra();
      } else {
        // Limpa dados ao deslogar
        this.clienteUuid = null;
        this.ministraSubject.next([]);
      }
    });
  }

  // ==================== OPERAÇÕES CRUD LOCAIS ====================

  /**
   * Carrega ministrações do storage local
   */
  private async carregarMinistra(): Promise<void> {
    const ministra = await this.storage.getCollectionAsArray<MinistraLocal>(
      STORAGE_KEYS.MINISTRA
    );

    // Filtrar deletados localmente
    const ativos = ministra.filter(m => !m.deletedLocally);

    // Filtra apenas as ministrações do cliente logado
    if (this.clienteUuid) {
      const clienteMinistra = ativos.filter(m => m.cliente_uuid === this.clienteUuid);
      this.ministraSubject.next(clienteMinistra);
    } else {
      this.ministraSubject.next([]);
    }
  }

  /**
   * Cria uma nova ministração (offline-first)
   */
  public async criar(dto: CriarMinistraLocalDTO, cliente_uuid: string): Promise<MinistraLocal> {

    // **IMPORTANTE**: Você precisa do UUID do cliente logado aqui.
    // Estou recebendo por parâmetro, mas você pode buscar do seu AuthService.
    if (!cliente_uuid) {
      throw new Error('UUID do cliente é necessário para criar ministração');
    }

    // Busca dados do medicamento para desnormalização
    const medicamento = await this.medicamentoService.buscarPorUuid(dto.medicamento_uuid);

    if (!medicamento) {
      throw new Error('Medicamento não encontrado');
    }

    if (!medicamento.serverId) {
      throw new Error('Aguarde a sincronização do medicamento antes de adicioná-lo à sua lista');
    }

    // 1. Cria o modelo local
    const ministra: MinistraLocal = {
      ...createBaseModel(),
      cliente_uuid: cliente_uuid,
      medicamento_uuid: dto.medicamento_uuid,
      horario: dto.horario || null,
      dosagem: dto.dosagem || null,
      frequencia: dto.frequencia || null,
      status: dto.status !== undefined ? dto.status : 1, // Default 1 (ativo)

      // Dados desnormalizados do medicamento para exibição offline
      medicamento_nome: medicamento.nome,
      medicamento_descricao: medicamento.descricao,
      medicamento_classe: medicamento.classe
    };

    // 2. Salva no storage local
    await this.storage.setInCollection(
      STORAGE_KEYS.MINISTRA,
      ministra.uuid,
      ministra
    );

    // 3. Adiciona à fila de sincronização
    const syncData = {
      medicamento_idmedicamento: medicamento.serverId, // ID do servidor do medicamento
      horario: ministra.horario,
      dosagem: ministra.dosagem,
      frequencia: ministra.frequencia,
      status: ministra.status
    };

    console.log('🔄 Adicionando à fila de sincronização:', syncData);

    await this.storage.addToSyncQueue({
      id: generateUUID(),
      entity: 'ministra',
      uuid: ministra.uuid,
      operation: 'create',
      data: syncData,
      timestamp: now(),
      retries: 0,
      maxRetries: 3
    });

    // 4. Atualiza Observable
    await this.carregarMinistra();

    return ministra;
  }

  /**
   * Lista todas as ministrações locais
   */
  public async listar(): Promise<MinistraLocal[]> {
    return this.ministraSubject.value;
  }

  /**
   * Busca uma ministração por UUID
   */
  public async buscarPorUuid(uuid: string): Promise<MinistraLocal | null> {
    return await this.storage.getFromCollection<MinistraLocal>(
      STORAGE_KEYS.MINISTRA,
      uuid
    );
  }

  /**
   * Edita uma ministração existente
   */
  public async editar(
    uuid: string,
    dados: Partial<CriarMinistraLocalDTO & { status: number }>
  ): Promise<MinistraLocal | null> {

    // 1. Busca ministração local
    const ministra = await this.buscarPorUuid(uuid);

    if (!ministra) {
      console.error(`Ministração ${uuid} não encontrada`);
      return null;
    }

    // 2. Atualiza dados
    const atualizado: MinistraLocal = {
      ...ministra,
      ...dados,
      ...markAsUpdated(ministra)
    };

    // TODO: Atualizar dados desnormalizados (medicamento_nome) se o uuid mudou

    // 3. Salva no storage
    await this.storage.setInCollection(
      STORAGE_KEYS.MINISTRA,
      uuid,
      atualizado
    );

    // 4. Adiciona à fila de sincronização (se já foi sincronizado)
    if (ministra.serverId) {
      await this.storage.addToSyncQueue({
        id: generateUUID(),
        entity: 'ministra',
        uuid: ministra.uuid,
        operation: 'update',
        data: { // Backend espera apenas os campos atualizáveis
          horario: atualizado.horario,
          dosagem: atualizado.dosagem,
          frequencia: atualizado.frequencia,
          status: atualizado.status
        },
        timestamp: now(),
        retries: 0,
        maxRetries: 3
      });
    }

    // 5. Atualiza Observable
    await this.carregarMinistra();

    console.log(`✅ Ministração ${uuid} atualizada localmente`);
    return atualizado;
  }

  /**
   * Registra que o medicamento foi tomado agora
   */
  public async registrarTomada(uuid: string): Promise<void> {
    const ministra = await this.buscarPorUuid(uuid);
    if (!ministra) return;

    const atualizado: MinistraLocal = {
      ...ministra,
      ultimaTomada: now(),
      ...markAsUpdated(ministra)
    };

    await this.storage.setInCollection(
      STORAGE_KEYS.MINISTRA,
      uuid,
      atualizado
    );

    // Não precisa syncar 'ultimaTomada' com o backend se o backend não suportar.
    // Mas se suportar, deveria ir no 'data'.
    // Assumindo que o backend não rastreia histórico de tomadas por enquanto (baseado na API doc),
    // mantemos apenas local ou enviamos se tiver campo.
    // A API doc não mostra endpoint de histórico de tomadas.
    // Então é feature local por enquanto.

    await this.carregarMinistra();
  }

  /**
   * Deleta uma ministração (soft delete local)
   */
  public async deletar(uuid: string): Promise<boolean> {
    // 1. Busca ministração
    const ministra = await this.buscarPorUuid(uuid);

    if (!ministra) {
      console.error(`Ministração ${uuid} não encontrada`);
      return false;
    }

    // 2. Marca como deletado localmente
    const deletado = markAsDeleted(ministra);

    // 3. Salva no storage (mantém para sincronizar)
    await this.storage.setInCollection(
      STORAGE_KEYS.MINISTRA,
      uuid,
      deletado
    );

    // 4. Adiciona à fila de sincronização (se já foi sincronizado)
    if (ministra.serverId) {
      await this.storage.addToSyncQueue({
        id: generateUUID(),
        entity: 'ministra',
        uuid: ministra.uuid,
        operation: 'delete',
        data: null,
        timestamp: now(),
        retries: 0,
        maxRetries: 3
      });
    } else {
      // Nunca foi sincronizado, pode remover direto
      await this.storage.removeFromCollection(STORAGE_KEYS.MINISTRA, uuid);
    }

    // 5. Atualiza Observable (remove da lista visível)
    await this.carregarMinistra();

    console.log(`✅ Ministração ${uuid} marcada para deleção`);
    return true;
  }

  // ==================== UTILITÁRIOS ====================

  /**
   * Limpa cache (força recarregar do storage)
   */
  public async recarregar(): Promise<void> {
    await this.carregarMinistra();
  }

  // ==================== SINCRONIZAÇÃO ====================

  /**
   * Mescla dados vindos do servidor com os dados locais
   */
  public async mesclarDoServidor(apiData: any[]): Promise<void> {
    if (!this.clienteUuid) {
      console.warn('⚠️ Cliente UUID não disponível, pulando mesclagem de ministra');
      return;
    }

    console.log(`📥 Mesclando ${apiData.length} ministrações do servidor`);

    for (const apiItem of apiData) {
      // Busca o medicamento pelo serverId para obter o UUID local
      const medicamento = await this.medicamentoService.buscarPorServerId(apiItem.medicamento_idmedicamento);

      if (!medicamento) {
        console.warn(`⚠️ Medicamento ${apiItem.medicamento_idmedicamento} não encontrado localmente`);
        continue;
      }

      // Busca se já existe localmente pelo serverId
      const existente = await this.buscarPorServerId(apiItem.idministra);

      if (existente) {
        // Atualiza se o servidor tem versão mais nova
        const serverTime = new Date(apiItem.updatedAt || apiItem.createdAt).getTime();
        const localTime = new Date(existente.serverUpdatedAt || existente.updatedAt).getTime();

        if (serverTime > localTime) {
          const atualizado = {
            ...existente,
            horario: apiItem.horario,
            dosagem: apiItem.dosagem,
            frequencia: apiItem.frequencia,
            status: apiItem.status,
            medicamento_nome: apiItem.medicamento?.nome,
            medicamento_descricao: apiItem.medicamento?.descricao,
            medicamento_classe: apiItem.medicamento?.classe,
            syncStatus: SyncStatus.SYNCED,
            syncedAt: now(),
            serverUpdatedAt: apiItem.updatedAt || apiItem.createdAt
          };

          await this.storage.setInCollection(STORAGE_KEYS.MINISTRA, existente.uuid, atualizado);
          console.log(`🔄 Ministração ${existente.uuid} (serverId: ${apiItem.idministra}) atualizada do servidor`);
        } else {
          console.log(`⏭️ Ministração ${existente.uuid} (serverId: ${apiItem.idministra}) já está atualizada`);
        }
      } else {
        // Cria novo registro local a partir do servidor
        const novo: MinistraLocal = {
          ...createBaseModel(),
          serverId: apiItem.idministra,
          cliente_uuid: this.clienteUuid,
          medicamento_uuid: medicamento.uuid,
          horario: apiItem.horario,
          dosagem: apiItem.dosagem,
          frequencia: apiItem.frequencia,
          status: apiItem.status,
          medicamento_nome: apiItem.medicamento?.nome,
          medicamento_descricao: apiItem.medicamento?.descricao,
          medicamento_classe: apiItem.medicamento?.classe,
          syncStatus: SyncStatus.SYNCED,
          syncedAt: now(),
          serverUpdatedAt: apiItem.updatedAt || apiItem.createdAt
        };

        await this.storage.setInCollection(STORAGE_KEYS.MINISTRA, novo.uuid, novo);
        console.log(`✅ Ministração ${novo.uuid} (serverId: ${apiItem.idministra}) criada do servidor`);
      }
    }

    await this.carregarMinistra();
    console.log(`✅ Mesclagem de ministrações concluída`);
  }

  /**
   * Busca uma ministração pelo serverId
   */
  private async buscarPorServerId(serverId: number): Promise<MinistraLocal | null> {
    const todas = await this.storage.getCollectionAsArray<MinistraLocal>(STORAGE_KEYS.MINISTRA);
    return todas.find(m => m.serverId === serverId) || null;
  }
}
