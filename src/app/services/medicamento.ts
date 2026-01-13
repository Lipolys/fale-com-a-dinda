import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { StorageService, STORAGE_KEYS } from './storage';
import { AuthService } from './auth';
import { environment } from '../../environments/environment';
import {
  MedicamentoLocal,
  CriarMedicamentoLocalDTO,
  createBaseModel,
  generateUUID,
  now,
  SyncStatus
} from '../models/local.models';

/**
 * Service para gerenciar medicamentos
 *
 * FARMACÊUTICO: Online-only - envia direto para API
 * CLIENTE: Offline-first - salva local e sincroniza depois
 */
@Injectable({
  providedIn: 'root'
})
export class MedicamentoService {
  private storage = inject(StorageService);
  private authService = inject(AuthService);
  private http = inject(HttpClient);


  private readonly API_URL = environment.apiUrl;

  // Observable para componentes reagirem a mudanças
  private medicamentosSubject = new BehaviorSubject<MedicamentoLocal[]>([]);
  public medicamentos$ = this.medicamentosSubject.asObservable();

  constructor() {
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
   * Cria um novo medicamento
   * FARMACÊUTICO: Envia direto para API (online-only)
   * CLIENTE: Nunca cria medicamentos
   */
  public async criar(dto: CriarMedicamentoLocalDTO): Promise<MedicamentoLocal> {
    const user = await this.authService.getCurrentUser();

    if (user?.tipo_usuario === 'FARMACEUTICO') {
      // FARMACÊUTICO: Online-only
      return await this.criarOnline(dto);
    } else {
      throw new Error('Apenas farmacêuticos podem criar medicamentos');
    }
  }

  /**
   * Cria medicamento diretamente na API (para farmacêuticos)
   */
  private async criarOnline(dto: CriarMedicamentoLocalDTO): Promise<MedicamentoLocal> {
    try {
      const token = await this.authService.getAccessToken();
      if (!token) {
        throw new Error('Não autenticado');
      }

      const headers = new HttpHeaders({
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      });

      const payload = {
        nome: dto.nome,
        descricao: dto.descricao,
        classe: dto.classe
      };

      console.log('📤 Criando medicamento online:', payload);

      const response = await this.http.post<any>(
        `${this.API_URL}/medicamento`,
        payload,
        { headers }
      ).toPromise();

      // Cria modelo local a partir da resposta
      const medicamento: MedicamentoLocal = {
        ...createBaseModel(),
        serverId: response.idmedicamento,
        nome: response.nome,
        descricao: response.descricao,
        classe: response.classe,
        farmaceutico_uuid: dto.farmaceutico_uuid || null,
        syncStatus: SyncStatus.SYNCED,
        syncedAt: now(),
        serverUpdatedAt: response.updatedAt || response.createdAt
      };

      // Salva localmente apenas para cache
      await this.storage.setInCollection(
        STORAGE_KEYS.MEDICAMENTOS,
        medicamento.uuid,
        medicamento
      );

      await this.carregarMedicamentos();
      console.log(`✅ Medicamento criado online: ${medicamento.uuid} (serverId: ${response.idmedicamento})`);

      return medicamento;

    } catch (error: any) {
      console.error('❌ Erro ao criar medicamento:', error);

      if (error.status === 0 || error.message === 'Http failure response for (unknown url): 0 Unknown Error') {
        throw new Error('Sem conexão com a internet. Não foi possível criar o medicamento.');
      } else if (error.status === 401) {
        throw new Error('Sessão expirada. Faça login novamente.');
      } else if (error.error?.erro) {
        throw new Error(error.error.erro);
      } else {
        throw new Error('Erro ao criar medicamento. Tente novamente.');
      }
    }
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
   * FARMACÊUTICO: Envia direto para API (online-only)
   */
  public async editar(
    uuid: string,
    dados: Partial<CriarMedicamentoLocalDTO>
  ): Promise<MedicamentoLocal | null> {
    const user = await this.authService.getCurrentUser();
    const medicamento = await this.buscarPorUuid(uuid);

    if (!medicamento) {
      console.error(`Medicamento ${uuid} não encontrado`);
      return null;
    }

    if (user?.tipo_usuario === 'FARMACEUTICO') {
      // FARMACÊUTICO: Online-only
      return await this.editarOnline(medicamento, dados);
    } else {
      throw new Error('Apenas farmacêuticos podem editar medicamentos');
    }
  }

  /**
   * Edita medicamento diretamente na API (para farmacêuticos)
   */
  private async editarOnline(
    medicamento: MedicamentoLocal,
    dados: Partial<CriarMedicamentoLocalDTO>
  ): Promise<MedicamentoLocal | null> {
    try {
      if (!medicamento.serverId) {
        throw new Error('Medicamento não foi sincronizado ainda');
      }

      const token = await this.authService.getAccessToken();
      if (!token) {
        throw new Error('Não autenticado');
      }

      const headers = new HttpHeaders({
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      });

      const payload = {
        nome: dados.nome || medicamento.nome,
        descricao: dados.descricao || medicamento.descricao,
        classe: dados.classe || medicamento.classe
      };

      console.log(`📤 Editando medicamento online (ID: ${medicamento.serverId}):`, payload);

      await this.http.put(
        `${this.API_URL}/medicamento/${medicamento.serverId}`,
        payload,
        { headers }
      ).toPromise();

      // Atualiza localmente após sucesso
      const atualizado: MedicamentoLocal = {
        ...medicamento,
        ...dados,
        updatedAt: now(),
        serverUpdatedAt: now(),
        syncedAt: now()
      };

      await this.storage.setInCollection(
        STORAGE_KEYS.MEDICAMENTOS,
        medicamento.uuid,
        atualizado
      );

      await this.carregarMedicamentos();
      console.log(`✅ Medicamento editado online: ${medicamento.uuid}`);

      return atualizado;

    } catch (error: any) {
      console.error('❌ Erro ao editar medicamento:', error);

      if (error.status === 0 || error.message === 'Http failure response for (unknown url): 0 Unknown Error') {
        throw new Error('Sem conexão com a internet. Não foi possível editar o medicamento.');
      } else if (error.status === 401) {
        throw new Error('Sessão expirada. Faça login novamente.');
      } else if (error.error?.erro) {
        throw new Error(error.error.erro);
      } else {
        throw new Error('Erro ao editar medicamento. Tente novamente.');
      }
    }
  }

  /**
   * Deleta um medicamento
   * FARMACÊUTICO: Envia direto para API (online-only)
   */
  public async deletar(uuid: string): Promise<boolean> {
    const user = await this.authService.getCurrentUser();
    const medicamento = await this.buscarPorUuid(uuid);

    if (!medicamento) {
      console.error(`Medicamento ${uuid} não encontrado`);
      return false;
    }

    if (user?.tipo_usuario === 'FARMACEUTICO') {
      // FARMACÊUTICO: Online-only
      return await this.deletarOnline(medicamento);
    } else {
      throw new Error('Apenas farmacêuticos podem deletar medicamentos');
    }
  }

  /**
   * Deleta medicamento diretamente na API (para farmacêuticos)
   */
  private async deletarOnline(medicamento: MedicamentoLocal): Promise<boolean> {
    try {
      if (!medicamento.serverId) {
        throw new Error('Medicamento não foi sincronizado ainda');
      }

      const token = await this.authService.getAccessToken();
      if (!token) {
        throw new Error('Não autenticado');
      }

      const headers = new HttpHeaders({
        'Authorization': `Bearer ${token}`
      });

      console.log(`📤 Deletando medicamento online (ID: ${medicamento.serverId})`);

      await this.http.delete(
        `${this.API_URL}/medicamento/${medicamento.serverId}`,
        { headers }
      ).toPromise();

      // Remove do storage local após sucesso
      await this.storage.removeFromCollection(
        STORAGE_KEYS.MEDICAMENTOS,
        medicamento.uuid
      );

      await this.carregarMedicamentos();
      console.log(`✅ Medicamento deletado online: ${medicamento.uuid}`);

      return true;

    } catch (error: any) {
      console.error('❌ Erro ao deletar medicamento:', error);

      if (error.status === 0 || error.message === 'Http failure response for (unknown url): 0 Unknown Error') {
        throw new Error('Sem conexão com a internet. Não foi possível deletar o medicamento.');
      } else if (error.status === 401) {
        throw new Error('Sessão expirada. Faça login novamente.');
      } else if (error.error?.erro) {
        throw new Error(error.error.erro);
      } else {
        throw new Error('Erro ao deletar medicamento. Tente novamente.');
      }
    }
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

        if (serverTime > localTime) {
          const atualizado: MedicamentoLocal = {
            ...existente,
            nome: apiMed.nome,
            descricao: apiMed.descricao,
            classe: apiMed.classe,
            serverUpdatedAt: apiMed.updatedAt || apiMed.createdAt,
            syncedAt: now(),
            syncStatus: SyncStatus.SYNCED
          };

          locais[existente.uuid] = atualizado;
          console.log(`🔄 Medicamento ${existente.uuid} atualizado do servidor`);
        } else {
          console.log(`⏭️ Medicamento ${existente.uuid} já está atualizado`);
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
        console.log(`✅ Medicamento ${novoLocal.uuid} criado do servidor`);
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
