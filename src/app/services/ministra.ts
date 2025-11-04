import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { StorageService, STORAGE_KEYS } from './storage';
import { AuthService } from './auth';
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
  private clienteUuid: any;

  constructor(
    private storage: StorageService,
    private authService: AuthService
  ) {
    this.clienteUuid = this.authService.getCurrentUserUuid();
    this.carregarMinistra();
  }

  // ==================== OPERAÇÕES CRUD LOCAIS ====================

  /**
   * Carrega ministrações do storage local
   */
  private async carregarMinistra(): Promise<void> {
    const ministra = await this.storage.getCollectionAsArray<MinistraLocal>(
      STORAGE_KEYS.MINISTRA //
    );

    // Filtrar deletados localmente
    const ativos = ministra.filter(m => !m.deletedLocally);

    const clienteMinistra = ativos.filter(m => m.cliente_uuid === this.clienteUuid);
    this.ministraSubject.next(clienteMinistra);

    // Por enquanto, carregando todos (ajuste quando tiver o auth)
    this.ministraSubject.next(ativos);
    console.log(`Carregados ${ativos.length} registros de ministração`);
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

    // 1. Cria o modelo local
    const ministra: MinistraLocal = {
      ...createBaseModel(),
      cliente_uuid: cliente_uuid,
      medicamento_uuid: dto.medicamento_uuid,
      horario: dto.horario || null,
      dosagem: dto.dosagem || null,
      frequencia: dto.frequencia || null,
      status: dto.status !== undefined ? dto.status : 1, // Default 1 (ativo)

      // TODO: Buscar o nome do medicamento para desnormalização
      // Se você injetar o MedicamentoService, pode buscar pelo dto.medicamento_uuid
      // e preencher 'medicamento_nome' aqui, para exibição offline.
      // medicamento_nome: (await this.medicamentoService.buscarPorUuid(dto.medicamento_uuid))?.nome
    };

    // 2. Salva no storage local
    await this.storage.setInCollection(
      STORAGE_KEYS.MINISTRA,
      ministra.uuid,
      ministra
    );

    // 3. Adiciona à fila de sincronização
    await this.storage.addToSyncQueue({
      id: generateUUID(),
      entity: 'ministra', // Nome da entidade para o SyncService
      uuid: ministra.uuid,
      operation: 'create',
      data: { // Dados que o backend espera
        // O SyncService deverá converter 'medicamento_uuid' para 'medicamento_idmedicamento'
        medicamento_uuid: ministra.medicamento_uuid,
        horario: ministra.horario,
        dosagem: ministra.dosagem,
        frequencia: ministra.frequencia,
        status: ministra.status
      },
      timestamp: now(),
      retries: 0,
      maxRetries: 3
    });

    // 4. Atualiza Observable
    await this.carregarMinistra();

    console.log(`✅ Ministração criada localmente: ${ministra.uuid}`);
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

  /* * As funções de Sincronização (mesclarDoServidor, atualizarPosSincronizacao)
   * são mais complexas para 'ministra' pois dependem de UUIDs relacionados
   * (cliente_uuid, medicamento_uuid) que precisam ser resolvidos.
   * Elas devem ser implementadas com cuidado no seu SyncService,
   * usando o 'id_mapping' para converter serverId -> uuid local.
   */
}
