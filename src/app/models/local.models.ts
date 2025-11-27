/**
 * Estados de sincronização de um registro
 */
export enum SyncStatus {
  SYNCED = 'synced',                    // Sincronizado com servidor
  PENDING_CREATE = 'pending_create',    // Criado offline, aguardando sync
  PENDING_UPDATE = 'pending_update',    // Editado offline
  PENDING_DELETE = 'pending_delete',    // Deletado offline
  CONFLICT = 'conflict'                 // Conflito detectado
}

/**
 * Interface base para todos os modelos locais
 */
export interface BaseLocalModel {
  // Identificação
  uuid: string;                   // Primary Key local (UUID v4)
  serverId: number | null;        // ID do servidor (null se não sincronizado)

  // Sincronização
  syncStatus: SyncStatus;
  createdAt: string;              // ISO timestamp local
  updatedAt: string;              // ISO timestamp local
  syncedAt: string | null;        // Última sync bem-sucedida
  serverUpdatedAt: string | null; // updatedAt do servidor

  // Metadados
  deviceId?: string;              // ID do dispositivo que criou
  deletedLocally?: boolean;       // Soft delete local
}

// ==================== MEDICAMENTO ====================

export interface MedicamentoLocal extends BaseLocalModel {
  // Dados do medicamento
  nome: string;
  descricao: string;
  classe: string;

  // Relacionamentos (UUID local)
  farmaceutico_uuid: string | null;

  // Dados do farmacêutico (desnormalizado para facilitar exibição offline)
  farmaceutico_nome?: string;
  farmaceutico_crf?: string;
}

/**
 * DTO para criar medicamento local
 */
export interface CriarMedicamentoLocalDTO {
  nome: string;
  descricao: string;
  classe: string;
  farmaceutico_uuid?: string;
}

// ==================== MINISTRA ====================

export interface MinistraLocal extends BaseLocalModel {
  // Relacionamentos (UUIDs locais)
  cliente_uuid: string;
  medicamento_uuid: string;

  // Dados
  horario: string | null;         // HH:mm formato
  dosagem: string | null;
  frequencia: number | null;      // Vezes por dia
  status: number;                 // 1 = ativo, 0 = inativo

  // Dados desnormalizados do medicamento (para exibição offline)
  medicamento_nome?: string;
  medicamento_descricao?: string;
  medicamento_classe?: string;

  // Tracking
  ultimaTomada?: string;          // ISO timestamp da última vez que tomou
  proximaTomada?: string;         // ISO timestamp calculado
}

export interface CriarMinistraLocalDTO {
  medicamento_uuid: string;
  horario?: string;
  dosagem?: string;
  frequencia?: number;
  status?: number;
}

// ==================== DICA ====================

export interface DicaLocal extends BaseLocalModel {
  // Relacionamento
  farmaceutico_uuid: string;

  // Dados
  texto: string;

  // Desnormalizado
  farmaceutico_nome?: string;
  farmaceutico_crf?: string;
}

export interface CriarDicaLocalDTO {
  texto: string;
  farmaceutico_uuid?: string;
}

// ==================== FAQ ====================

export interface FaqLocal extends BaseLocalModel {
  // Relacionamento
  farmaceutico_uuid: string;

  // Dados
  pergunta: string;
  resposta: string;

  // Desnormalizado
  farmaceutico_nome?: string;
  farmaceutico_crf?: string;

  // Metadados úteis
  visualizacoes?: number;
  util?: boolean | null;  // Feedback do usuário
}

export interface CriarFaqLocalDTO {
  pergunta: string;
  resposta: string;
  farmaceutico_uuid?: string;
}

// ==================== INTERAÇÃO ====================

export interface InteracaoLocal extends BaseLocalModel {
  // Relacionamentos (UUIDs locais)
  medicamento1_uuid: string;
  medicamento2_uuid: string;
  farmaceutico_uuid: string;

  // Dados
  descricao: string;
  gravidade: 'BAIXA' | 'MEDIA' | 'ALTA';
  fonte: string | null;

  // IDs compostos do servidor (após sincronização)
  serverIds?: {
    idmedicamento1: number;
    idmedicamento2: number;
  };

  // Desnormalizado
  medicamento1_nome?: string;
  medicamento2_nome?: string;
  farmaceutico_nome?: string;
}

export interface CriarInteracaoLocalDTO {
  medicamento1_uuid: string;
  medicamento2_uuid: string;
  descricao: string;
  gravidade: 'BAIXA' | 'MEDIA' | 'ALTA';
  fonte?: string;
  farmaceutico_uuid?: string;
}

// ==================== USUÁRIO ====================

export interface UsuarioLocal {
  uuid: string;
  serverId: number | null;

  nome: string;
  email: string;
  telefone: string;
  nascimento: string;            // ISO date string
  tipo: 'CLIENTE' | 'FARMACEUTICO';

  // Cliente específico
  cliente?: {
    uuid: string;
    serverId: number | null;
  };

  // Farmacêutico específico
  farmaceutico?: {
    uuid: string;
    serverId: number | null;
    crf: string;
  };

  // Não armazenar senha localmente!
  // Apenas token de auth
}

// ==================== MAPEAMENTO ID ====================

/**
 * Mapeamento entre UUIDs locais e IDs do servidor
 * Facilita lookup rápido
 */
export interface IdMapping {
  // uuid -> serverId
  [uuid: string]: number;
}

/**
 * Mapeamento por entidade
 */
export interface EntityIdMapping {
  medicamentos: IdMapping;
  ministra: IdMapping;
  dicas: IdMapping;
  faqs: IdMapping;
  usuarios: IdMapping;
}

// ==================== UTILITÁRIOS ====================

/**
 * Helper para gerar UUID v4
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Helper para criar timestamp ISO
 */
export function now(): string {
  return new Date().toISOString();
}

/**
 * Helper para criar modelo base
 */
export function createBaseModel(
  uuid?: string,
  syncStatus: SyncStatus = SyncStatus.PENDING_CREATE
): Pick<BaseLocalModel, 'uuid' | 'syncStatus' | 'createdAt' | 'updatedAt' | 'serverId' | 'syncedAt' | 'serverUpdatedAt'> {
  const timestamp = now();
  return {
    uuid: uuid || generateUUID(),
    serverId: null,
    syncStatus,
    createdAt: timestamp,
    updatedAt: timestamp,
    syncedAt: null,
    serverUpdatedAt: null
  };
}

/**
 * Helper para verificar se modelo precisa sync
 */
export function needsSync(model: BaseLocalModel): boolean {
  return model.syncStatus !== SyncStatus.SYNCED;
}

/**
 * Helper para verificar se modelo é novo (não tem serverId)
 */
export function isNewLocal(model: BaseLocalModel): boolean {
  return model.serverId === null;
}

/**
 * Helper para marcar modelo como deletado
 */
export function markAsDeleted<T extends BaseLocalModel>(model: T): T {
  return {
    ...model,
    syncStatus: SyncStatus.PENDING_DELETE,
    deletedLocally: true,
    updatedAt: now()
  };
}

/**
 * Helper para atualizar modelo após sync bem-sucedida
 */
export function markAsSynced<T extends BaseLocalModel>(
  model: T,
  serverId: number,
  serverUpdatedAt?: string
): T {
  return {
    ...model,
    serverId,
    syncStatus: SyncStatus.SYNCED,
    syncedAt: now(),
    serverUpdatedAt: serverUpdatedAt || now()
  };
}

/**
 * Helper para marcar modelo como pendente de update
 */
export function markAsUpdated<T extends BaseLocalModel>(model: T): T {
  return {
    ...model,
    syncStatus: model.serverId
      ? SyncStatus.PENDING_UPDATE
      : SyncStatus.PENDING_CREATE,
    updatedAt: now()
  };
}

// ==================== CONVERSORES (LOCAL ↔ SERVIDOR) ====================

/**
 * Converte MedicamentoLocal para formato da API
 */
export function medicamentoLocalToApi(local: MedicamentoLocal): any {
  return {
    nome: local.nome,
    descricao: local.descricao,
    classe: local.classe
    // farmaceutico_idfarmaceutico será preenchido pelo backend baseado no token
  };
}

/**
 * Converte resposta da API para MedicamentoLocal
 */
export function medicamentoApiToLocal(
  api: any,
  existingLocal?: MedicamentoLocal
): MedicamentoLocal {
  const base = existingLocal || createBaseModel();

  return {
    ...base,
    serverId: api.idmedicamento,
    nome: api.nome,
    descricao: api.descricao,
    classe: api.classe,
    farmaceutico_uuid: existingLocal?.farmaceutico_uuid || generateUUID(),
    syncStatus: SyncStatus.SYNCED,
    syncedAt: now(),
    serverUpdatedAt: api.updatedAt || api.createdAt,

    // Dados desnormalizados se disponíveis
    farmaceutico_nome: api.farmaceutico?.usuario?.nome,
    farmaceutico_crf: api.farmaceutico?.crf
  };
}

/**
 * Converte MinistraLocal para formato da API
 */
export function ministraLocalToApi(
  local: MinistraLocal,
  medicamentoServerId: number
): any {
  return {
    medicamento_idmedicamento: medicamentoServerId,
    horario: local.horario,
    dosagem: local.dosagem,
    frequencia: local.frequencia,
    status: local.status
    // cliente_idcliente será preenchido pelo backend baseado no token
  };
}

/**
 * Converte resposta da API para MinistraLocal
 */
export function ministraApiToLocal(
  api: any,
  medicamentoUuid: string,
  clienteUuid: string,
  existingLocal?: MinistraLocal
): MinistraLocal {
  const base = existingLocal || createBaseModel();

  return {
    ...base,
    serverId: api.idministra,
    cliente_uuid: clienteUuid,
    medicamento_uuid: medicamentoUuid,
    horario: api.horario,
    dosagem: api.dosagem,
    frequencia: api.frequencia,
    status: api.status,
    syncStatus: SyncStatus.SYNCED,
    syncedAt: now(),
    serverUpdatedAt: api.updatedAt || api.createdAt,

    // Dados desnormalizados
    medicamento_nome: api.medicamento?.nome,
    medicamento_descricao: api.medicamento?.descricao,
    medicamento_classe: api.medicamento?.classe
  };
}

// ==================== FILTROS E QUERIES ====================

/**
 * Filtra modelos por status de sync
 */
export function filterBySync<T extends BaseLocalModel>(
  items: T[],
  status: SyncStatus
): T[] {
  return items.filter(item => item.syncStatus === status);
}

/**
 * Retorna apenas itens que precisam ser sincronizados
 */
export function getPendingSync<T extends BaseLocalModel>(items: T[]): T[] {
  return items.filter(item => needsSync(item) && !item.deletedLocally);
}

/**
 * Retorna apenas itens deletados localmente
 */
export function getDeleted<T extends BaseLocalModel>(items: T[]): T[] {
  return items.filter(item => item.deletedLocally === true);
}

/**
 * Ordena por data de atualização (mais recente primeiro)
 */
export function sortByUpdated<T extends BaseLocalModel>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}
/**
 * Converte resposta da API para FaqLocal
 */
export function faqApiToLocal(
  api: any,
  existingLocal?: FaqLocal
): FaqLocal {
  const base = existingLocal || createBaseModel();

  return {
    ...base,
    serverId: api.idfaq,
    pergunta: api.pergunta,
    resposta: api.resposta,
    farmaceutico_uuid: existingLocal?.farmaceutico_uuid || generateUUID(), // Se não tem local, gera um (mas deveria vir do server se possível, ou ignorar)
    syncStatus: SyncStatus.SYNCED,
    syncedAt: now(),
    serverUpdatedAt: api.updatedAt || api.createdAt,

    // Dados desnormalizados
    farmaceutico_nome: api.farmaceutico?.usuario?.nome,
    farmaceutico_crf: api.farmaceutico?.crf
  };
}

/**
 * Converte resposta da API para InteracaoLocal
 */
export function interacaoApiToLocal(
  api: any,
  med1Uuid: string,
  med2Uuid: string,
  existingLocal?: InteracaoLocal
): InteracaoLocal {
  const base = existingLocal || createBaseModel();

  return {
    ...base,
    serverIds: {
      idmedicamento1: api.idmedicamento1,
      idmedicamento2: api.idmedicamento2
    },
    serverId: 0,

    medicamento1_uuid: med1Uuid,
    medicamento2_uuid: med2Uuid,
    farmaceutico_uuid: existingLocal?.farmaceutico_uuid || generateUUID(),

    descricao: api.descricao,
    gravidade: api.gravidade,
    fonte: api.fonte,

    syncStatus: SyncStatus.SYNCED,
    syncedAt: now(),
    serverUpdatedAt: api.updatedAt || api.createdAt,

    medicamento1_nome: api.medicamento1?.nome,
    medicamento2_nome: api.medicamento2?.nome,
    farmaceutico_nome: api.farmaceutico?.usuario?.nome
  };
}
