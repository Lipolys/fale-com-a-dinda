import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { StorageService, STORAGE_KEYS } from './storage';
import { AuthService } from './auth';
import {
  MedicamentoLocal,
  CriarMedicamentoLocalDTO,
  createBaseModel,
  generateUUID,
  now,
  markAsUpdated,
  markAsDeleted,
  SyncStatus
} from '../models/local.models';

/**
 * Service para gerenciar medicamentos com suporte offline-first
 *
 * FUNCIONAMENTO:
 * 1. Todas as operações são feitas localmente primeiro (Ionic Storage)
 * 2. Operações são adicionadas à fila de sincronização
 * 3. SyncService sincroniza automaticamente quando online
 * 4. Dados sempre disponíveis offline
 */
@Injectable({
  providedIn: 'root'
})
export class MedicamentoService {

  // Observable para componentes reagirem a mudanças
  private medicamentosSubject = new BehaviorSubject<MedicamentoLocal[]>([]);
  public medicamentos$ = this.medicamentosSubject.asObservable();

  constructor(
    private storage: StorageService,
    private authService: AuthService
  ) {
    // Monitora mudanças de autenticação para recarregar dados
    this.authService.isAuthenticated$.subscribe(async (isAuthenticated) => {
      if (isAuthenticated) {
        await this.carregarMedicamentos();
      } else {
        // Limpa dados ao deslogar
        this.medicamentosSubject.next([]);
      }
    });
  }

  // ==================== OPERAÇÕES CRUD LOCAIS ====================

  /**
   * Carrega medicamentos do storage local
   */
  private async carregarMedicamentos(): Promise<void> {
    const medicamentos = await this.storage.getCollectionAsArray<MedicamentoLocal>(
      STORAGE_KEYS.MEDICAMENTOS
    );

    // Filtrar deletados localmente
    const ativos = medicamentos.filter(m => !m.deletedLocally);

    this.medicamentosSubject.next(ativos);
  }

  /**
   * Cria um novo medicamento (offline-first)
   */
  public async criar(dto: CriarMedicamentoLocalDTO): Promise<MedicamentoLocal> {
    // 1. Cria medicamento local com UUID
    const medicamento: MedicamentoLocal = {
      ...createBaseModel(),
      nome: dto.nome,
      descricao: dto.descricao,
      classe: dto.classe,
      farmaceutico_uuid: dto.farmaceutico_uuid || null
    };

    // 2. Salva no storage local
    await this.storage.setInCollection(
      STORAGE_KEYS.MEDICAMENTOS,
      medicamento.uuid,
      medicamento
    );

    // 3. Adiciona à fila de sincronização
    await this.storage.addToSyncQueue({
      id: generateUUID(),
      entity: 'medicamento',
      uuid: medicamento.uuid,
      operation: 'create',
      data: {
        nome: medicamento.nome,
        descricao: medicamento.descricao,
        classe: medicamento.classe
      },
      timestamp: now(),
      retries: 0,
      maxRetries: 3
    });

    // 4. Atualiza Observable
    await this.carregarMedicamentos();

    console.log(`✅ Medicamento criado localmente: ${medicamento.uuid}`);
    return medicamento;
  }

  /**
   * Lista todos os medicamentos locais
   */
  public async listar(): Promise<MedicamentoLocal[]> {
    return this.medicamentosSubject.value;
  }

  /**
   * Busca um medicamento por UUID
   */
  public async buscarPorUuid(uuid: string): Promise<MedicamentoLocal | null> {
    return await this.storage.getFromCollection<MedicamentoLocal>(
      STORAGE_KEYS.MEDICAMENTOS,
      uuid
    );
  }

  /**
   * Busca um medicamento por serverId
   */
  public async buscarPorServerId(serverId: number): Promise<MedicamentoLocal | null> {
    const medicamentos = await this.listar();
    return medicamentos.find(m => m.serverId === serverId) || null;
  }

  /**
   * Edita um medicamento existente
   */
  public async editar(
    uuid: string,
    dados: Partial<CriarMedicamentoLocalDTO>
  ): Promise<MedicamentoLocal | null> {
    // 1. Busca medicamento local
    const medicamento = await this.buscarPorUuid(uuid);

    if (!medicamento) {
      console.error(`Medicamento ${uuid} não encontrado`);
      return null;
    }

    // 2. Atualiza dados
    const atualizado: MedicamentoLocal = {
      ...medicamento,
      ...dados,
      ...markAsUpdated(medicamento)
    };

    // 3. Salva no storage
    await this.storage.setInCollection(
      STORAGE_KEYS.MEDICAMENTOS,
      uuid,
      atualizado
    );

    // 4. Adiciona à fila de sincronização
    // Só adiciona se já foi sincronizado antes (tem serverId)
    if (medicamento.serverId) {
      await this.storage.addToSyncQueue({
        id: generateUUID(),
        entity: 'medicamento',
        uuid: medicamento.uuid,
        operation: 'update',
        data: {
          nome: atualizado.nome,
          descricao: atualizado.descricao,
          classe: atualizado.classe
        },
        timestamp: now(),
        retries: 0,
        maxRetries: 3
      });
    }

    // 5. Atualiza Observable
    await this.carregarMedicamentos();

    console.log(`✅ Medicamento ${uuid} atualizado localmente`);
    return atualizado;
  }

  /**
   * Deleta um medicamento (soft delete local)
   */
  public async deletar(uuid: string): Promise<boolean> {
    // 1. Busca medicamento
    const medicamento = await this.buscarPorUuid(uuid);

    if (!medicamento) {
      console.error(`Medicamento ${uuid} não encontrado`);
      return false;
    }

    // 2. Marca como deletado localmente
    const deletado = markAsDeleted(medicamento);

    // 3. Salva no storage (mantém para sincronizar)
    await this.storage.setInCollection(
      STORAGE_KEYS.MEDICAMENTOS,
      uuid,
      deletado
    );

    // 4. Adiciona à fila de sincronização (se já foi sincronizado)
    if (medicamento.serverId) {
      await this.storage.addToSyncQueue({
        id: generateUUID(),
        entity: 'medicamento',
        uuid: medicamento.uuid,
        operation: 'delete',
        data: null,
        timestamp: now(),
        retries: 0,
        maxRetries: 3
      });
    } else {
      // Nunca foi sincronizado, pode remover direto
      await this.storage.removeFromCollection(STORAGE_KEYS.MEDICAMENTOS, uuid);
    }

    // 5. Atualiza Observable (remove da lista visível)
    await this.carregarMedicamentos();

    console.log(`✅ Medicamento ${uuid} marcado para deleção`);
    return true;
  }

  // ==================== FILTROS E BUSCAS ====================

  /**
   * Busca medicamentos por nome (case-insensitive)
   */
  public async buscarPorNome(nome: string): Promise<MedicamentoLocal[]> {
    const medicamentos = await this.listar();
    const termoBusca = nome.toLowerCase();

    return medicamentos.filter(m =>
      m.nome.toLowerCase().includes(termoBusca)
    );
  }

  /**
   * Busca medicamentos por classe
   */
  public async buscarPorClasse(classe: string): Promise<MedicamentoLocal[]> {
    const medicamentos = await this.listar();

    return medicamentos.filter(m =>
      m.classe.toLowerCase() === classe.toLowerCase()
    );
  }

  /**
   * Lista todas as classes de medicamentos (únicas)
   */
  public async listarClasses(): Promise<string[]> {
    const medicamentos = await this.listar();
    const classes = new Set(medicamentos.map(m => m.classe));
    return Array.from(classes).sort();
  }

  /**
   * Filtra medicamentos por status de sincronização
   */
  public async filtrarPorSync(status: SyncStatus): Promise<MedicamentoLocal[]> {
    const medicamentos = await this.listar();
    return medicamentos.filter(m => m.syncStatus === status);
  }

  /**
   * Retorna medicamentos não sincronizados
   */
  public async listarNaoSincronizados(): Promise<MedicamentoLocal[]> {
    const medicamentos = await this.listar();
    return medicamentos.filter(m => m.syncStatus !== SyncStatus.SYNCED);
  }

  // ==================== ESTATÍSTICAS ====================

  /**
   * Conta total de medicamentos
   */
  public async contar(): Promise<number> {
    const medicamentos = await this.listar();
    return medicamentos.length;
  }

  /**
   * Conta medicamentos pendentes de sincronização
   */
  public async contarPendentes(): Promise<number> {
    const pendentes = await this.listarNaoSincronizados();
    return pendentes.length;
  }

  // ==================== SINCRONIZAÇÃO ====================

  /**
   * Atualiza medicamento após sincronização bem-sucedida
   * (Chamado pelo SyncService)
   */
  public async atualizarPosSincronizacao(
    uuid: string,
    serverId: number,
    serverData?: any
  ): Promise<void> {
    const medicamento = await this.buscarPorUuid(uuid);

    if (!medicamento) {
      console.error(`Medicamento ${uuid} não encontrado para atualizar`);
      return;
    }

    const atualizado: MedicamentoLocal = {
      ...medicamento,
      serverId,
      syncStatus: SyncStatus.SYNCED,
      syncedAt: now(),
      serverUpdatedAt: serverData?.updatedAt || now()
    };

    await this.storage.setInCollection(
      STORAGE_KEYS.MEDICAMENTOS,
      uuid,
      atualizado
    );

    await this.carregarMedicamentos();
  }

  /**
   * Mescla medicamentos vindos do servidor com locais
   * (Chamado pelo SyncService após download)
   */
  public async mesclarDoServidor(medicamentosServidor: any[] | undefined): Promise<void> {
    if (!medicamentosServidor || medicamentosServidor.length === 0) {
      return;
    }


    const locais = await this.storage.getCollection<MedicamentoLocal>(
      STORAGE_KEYS.MEDICAMENTOS
    );

    for (const apiMed of medicamentosServidor) {
      // Procura se já existe localmente (por serverId)
      const existente = Object.values(locais).find(
        m => m.serverId === apiMed.idmedicamento
      );

      if (existente) {
        // Já existe localmente - verifica se servidor é mais recente
        const serverTime = new Date(apiMed.updatedAt || apiMed.createdAt).getTime();
        const localTime = new Date(existente.updatedAt).getTime();

        if (serverTime > localTime && existente.syncStatus === SyncStatus.SYNCED) {
          const atualizado: MedicamentoLocal = {
            ...existente,
            nome: apiMed.nome,
            descricao: apiMed.descricao,
            classe: apiMed.classe,
            serverUpdatedAt: apiMed.updatedAt || apiMed.createdAt,
            syncedAt: now()
          };

          locais[existente.uuid] = atualizado;
          // Atualiza
          await this.storage.setInCollection(
            STORAGE_KEYS.MEDICAMENTOS,
            existente.uuid,
            atualizado
          );
        }
      } else {
        // Não existe localmente - adiciona
        const novoLocal: MedicamentoLocal = {
          ...createBaseModel(generateUUID(), SyncStatus.SYNCED),
          serverId: apiMed.idmedicamento,
          nome: apiMed.nome,
          descricao: apiMed.descricao,
          classe: apiMed.classe,
          farmaceutico_uuid: generateUUID(),
          serverUpdatedAt: apiMed.updatedAt || apiMed.createdAt,
          syncedAt: now(),
          farmaceutico_nome: apiMed.farmaceutico?.usuario?.nome,
          farmaceutico_crf: apiMed.farmaceutico?.crf
        };

        locais[novoLocal.uuid] = novoLocal;
      }
    }

    // Salva e notifica
    await this.storage.setCollection(STORAGE_KEYS.MEDICAMENTOS, locais);
    await this.carregarMedicamentos();
  }

  // ==================== UTILITÁRIOS ====================

  /**
   * Limpa cache de medicamentos (força recarregar do storage)
   */
  public async recarregar(): Promise<void> {
    await this.carregarMedicamentos();
  }

  /**
   * Exporta medicamentos para backup/debug
   */
  public async exportar(): Promise<MedicamentoLocal[]> {
    return await this.storage.getCollectionAsArray<MedicamentoLocal>(
      STORAGE_KEYS.MEDICAMENTOS
    );
  }

  /**
   * Limpa todos os medicamentos (CUIDADO!)
   */
  public async limparTudo(): Promise<void> {
    await this.storage.setCollection(STORAGE_KEYS.MEDICAMENTOS, {});
    await this.carregarMedicamentos();
    console.log('🗑️ Todos os medicamentos removidos');
  }
}
