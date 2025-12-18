import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { StorageService, STORAGE_KEYS } from './storage';
import { AuthService } from './auth';
import { environment } from '../../environments/environment';
import {
    InteracaoLocal,
    interacaoApiToLocal,
    createBaseModel,
    now,
    markAsUpdated,
    SyncStatus
} from '../models/local.models';
import { MedicamentoService } from './medicamento';

/**
 * Service para gerenciar Interações
 * FARMACÊUTICO: Online-only - envia direto para API
 * CLIENTE: Apenas leitura
 */
@Injectable({
    providedIn: 'root'
})
export class InteracaoService {

    private readonly API_URL = environment.apiUrl;
    private interacaoSubject = new BehaviorSubject<InteracaoLocal[]>([]);
    public interacao$ = this.interacaoSubject.asObservable();

    constructor(
        private storage: StorageService,
        private medicamentoService: MedicamentoService,
        private authService: AuthService,
        private http: HttpClient
    ) {
        this.carregarInteracoes();
    }

    private async carregarInteracoes(): Promise<void> {
        const interacoes = await this.storage.getCollectionAsArray<InteracaoLocal>(
            STORAGE_KEYS.INTERACOES
        );
        // Filtrar deletados localmente
        const ativos = interacoes.filter(i => !i.deletedLocally);
        this.interacaoSubject.next(ativos);
    }

    public async listar(): Promise<InteracaoLocal[]> {
        return this.interacaoSubject.value;
    }

    public async buscarPorUuid(uuid: string): Promise<InteracaoLocal | null> {
        return await this.storage.getFromCollection<InteracaoLocal>(
            STORAGE_KEYS.INTERACOES,
            uuid
        );
    }

    /**
     * Verifica interações entre um novo medicamento e uma lista de medicamentos
     */
    public async verificarInteracoes(
        novoMedUuid: string,
        listaMedsUuids: string[]
    ): Promise<InteracaoLocal[]> {
        const todasInteracoes = await this.listar();
        const interacoesEncontradas: InteracaoLocal[] = [];

        // Buscar todos os medicamentos para resolver nomes
        const medicamentos = await this.medicamentoService.listar();
        const mapUuidToNome = new Map<string, string>();
        medicamentos.forEach(m => {
            mapUuidToNome.set(m.uuid, m.nome);
        });

        for (const medUuid of listaMedsUuids) {
            // Verifica se existe interação entre novoMedUuid e medUuid
            // A interação pode estar cadastrada como (med1, med2) ou (med2, med1)
            const interacao = todasInteracoes.find(i =>
                (i.medicamento1_uuid === novoMedUuid && i.medicamento2_uuid === medUuid) ||
                (i.medicamento1_uuid === medUuid && i.medicamento2_uuid === novoMedUuid)
            );

            if (interacao) {
                // Resolver nomes dos medicamentos
                const interacaoComNomes = {
                    ...interacao,
                    medicamento1_nome: mapUuidToNome.get(interacao.medicamento1_uuid) || 'Medicamento desconhecido',
                    medicamento2_nome: mapUuidToNome.get(interacao.medicamento2_uuid) || 'Medicamento desconhecido'
                };
                interacoesEncontradas.push(interacaoComNomes);
            }
        }

        return interacoesEncontradas;
    }

    /**
     * Busca interações existentes entre uma lista de medicamentos
     * Retorna interações onde AMBOS os medicamentos estão na lista fornecida
     */
    public async buscarInteracoesEntreMedicamentos(uuids: string[]): Promise<InteracaoLocal[]> {
        const todasInteracoes = await this.listar();
        const interacoesEncontradas: InteracaoLocal[] = [];
        const setUuids = new Set(uuids);

        // Buscar todos os medicamentos para resolver nomes
        const medicamentos = await this.medicamentoService.listar();
        const mapUuidToNome = new Map<string, string>();
        medicamentos.forEach(m => {
            mapUuidToNome.set(m.uuid, m.nome);
        });

        todasInteracoes.forEach(i => {
            // Verifica se AMBOS os medicamentos da interação estão na lista do usuário
            if (setUuids.has(i.medicamento1_uuid) && setUuids.has(i.medicamento2_uuid)) {
                // Resolver nomes dos medicamentos
                const interacaoComNomes = {
                    ...i,
                    medicamento1_nome: mapUuidToNome.get(i.medicamento1_uuid) || 'Medicamento desconhecido',
                    medicamento2_nome: mapUuidToNome.get(i.medicamento2_uuid) || 'Medicamento desconhecido'
                };
                interacoesEncontradas.push(interacaoComNomes);
            }
        });

        return interacoesEncontradas;
    }

    public async mesclarDoServidor(apiResponse: any[]): Promise<void> {
        // Preciso dos medicamentos para resolver IDs -> UUIDs e nomes
        const medicamentos = await this.medicamentoService.listar();
        const mapIdToUuid = new Map<number, string>();
        const mapIdToNome = new Map<number, string>();
        medicamentos.forEach(m => {
            if (m.serverId) {
                mapIdToUuid.set(m.serverId, m.uuid);
                mapIdToNome.set(m.serverId, m.nome);
            }
        });

        const atuais = await this.listar();
        // Chave composta para identificar unicamente: id1-id2
        const mapAtuais = new Map<string, InteracaoLocal>();
        atuais.forEach(i => {
            if (i.serverIds) {
                const key = `${i.serverIds.idmedicamento1}-${i.serverIds.idmedicamento2}`;
                mapAtuais.set(key, i);
            }
        });

        for (const apiInteracao of apiResponse) {
            const id1 = apiInteracao.idmedicamento1;
            const id2 = apiInteracao.idmedicamento2;
            const key = `${id1}-${id2}`;

            const med1Uuid = mapIdToUuid.get(id1);
            const med2Uuid = mapIdToUuid.get(id2);
            const med1Nome = mapIdToNome.get(id1);
            const med2Nome = mapIdToNome.get(id2);

            if (med1Uuid && med2Uuid) {
                const existing = mapAtuais.get(key);
                const updated = interacaoApiToLocal(apiInteracao, med1Uuid, med2Uuid, existing);

                // Garantir que os nomes estão preenchidos
                updated.medicamento1_nome = updated.medicamento1_nome || med1Nome || 'Medicamento desconhecido';
                updated.medicamento2_nome = updated.medicamento2_nome || med2Nome || 'Medicamento desconhecido';

                await this.storage.setInCollection(
                    STORAGE_KEYS.INTERACOES,
                    updated.uuid,
                    updated
                );
            } else {
                // console.warn(`Interação ignorada: Medicamentos ${id1} ou ${id2} não encontrados localmente.`);
            }
        }

        await this.carregarInteracoes();
    }

    // ==================== CRUD LOCAL ====================

    public async criar(dados: {
        medicamento1_uuid: string,
        medicamento2_uuid: string,
        descricao: string,
        gravidade: 'BAIXA' | 'MEDIA' | 'ALTA'
    }): Promise<InteracaoLocal> {
        const user = await this.authService.getCurrentUser();
        if (user?.tipo_usuario !== 'FARMACEUTICO') {
            throw new Error('Apenas farmacêuticos podem criar interações');
        }

        const med1 = await this.medicamentoService.buscarPorUuid(dados.medicamento1_uuid);
        const med2 = await this.medicamentoService.buscarPorUuid(dados.medicamento2_uuid);

        if (!med1 || !med2) {
            throw new Error('Medicamentos não encontrados para criar interação');
        }

        if (!med1.serverId || !med2.serverId) {
            throw new Error('Medicamentos não foram sincronizados ainda');
        }

        try {
            const token = await this.authService.getAccessToken();
            if (!token) throw new Error('Não autenticado');

            const headers = new HttpHeaders({
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            });

            const payload = {
                idmedicamento1: med1.serverId,
                idmedicamento2: med2.serverId,
                descricao: dados.descricao,
                gravidade: dados.gravidade
            };

            const response = await this.http.post<any>(
                `${this.API_URL}/interacao`,
                payload,
                { headers }
            ).toPromise();

            const interacao: InteracaoLocal = {
                ...createBaseModel(),
                serverId: response.idinteracao,
                medicamento1_uuid: dados.medicamento1_uuid,
                medicamento2_uuid: dados.medicamento2_uuid,
                medicamento1_nome: med1.nome,
                medicamento2_nome: med2.nome,
                descricao: dados.descricao,
                gravidade: dados.gravidade,
                farmaceutico_uuid: user.idusuario?.toString() || '',
                fonte: null,
                syncStatus: SyncStatus.SYNCED,
                syncedAt: now(),
                serverIds: {
                    idmedicamento1: med1.serverId,
                    idmedicamento2: med2.serverId
                }
            };

            await this.storage.setInCollection(STORAGE_KEYS.INTERACOES, interacao.uuid, interacao);
            await this.carregarInteracoes();
            console.log(`✅ Interação criada online: ${interacao.uuid}`);
            return interacao;

        } catch (error: any) {
            console.error('❌ Erro ao criar interação:', error);
            if (error.status === 0) {
                throw new Error('Sem conexão. Não foi possível criar a interação.');
            }
            throw new Error(error.error?.erro || 'Erro ao criar interação.');
        }
    }

    public async editar(uuid: string, dados: {
        descricao: string,
        gravidade: 'BAIXA' | 'MEDIA' | 'ALTA'
    }): Promise<InteracaoLocal | null> {
        const user = await this.authService.getCurrentUser();
        if (user?.tipo_usuario !== 'FARMACEUTICO') {
            throw new Error('Apenas farmacêuticos podem editar interações');
        }

        const interacao = await this.buscarPorUuid(uuid);
        if (!interacao) return null;

        if (!interacao.serverIds?.idmedicamento1 || !interacao.serverIds?.idmedicamento2) {
            throw new Error('Interação não foi sincronizada ainda');
        }

        try {
            const token = await this.authService.getAccessToken();
            if (!token) throw new Error('Não autenticado');

            const headers = new HttpHeaders({
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            });

            const payload = {
                descricao: dados.descricao,
                gravidade: dados.gravidade
            };

            await this.http.put(
                `${this.API_URL}/interacao/${interacao.serverIds.idmedicamento1}/${interacao.serverIds.idmedicamento2}`,
                payload,
                { headers }
            ).toPromise();

            const atualizado: InteracaoLocal = {
                ...interacao,
                ...markAsUpdated(interacao),
                descricao: dados.descricao,
                gravidade: dados.gravidade,
                syncStatus: SyncStatus.SYNCED,
                syncedAt: now()
            };

            await this.storage.setInCollection(STORAGE_KEYS.INTERACOES, uuid, atualizado);
            await this.carregarInteracoes();
            console.log(`✅ Interação editada online: ${uuid}`);
            return atualizado;

        } catch (error: any) {
            console.error('❌ Erro ao editar interação:', error);
            if (error.status === 0) {
                throw new Error('Sem conexão. Não foi possível editar a interação.');
            }
            throw new Error(error.error?.erro || 'Erro ao editar interação.');
        }
    }

    public async deletar(uuid: string): Promise<boolean> {
        const user = await this.authService.getCurrentUser();
        if (user?.tipo_usuario !== 'FARMACEUTICO') {
            throw new Error('Apenas farmacêuticos podem deletar interações');
        }

        const interacao = await this.buscarPorUuid(uuid);
        if (!interacao) return false;

        // Se a interação nunca foi sincronizada, apenas remove localmente
        if (!interacao.serverIds?.idmedicamento1 || !interacao.serverIds?.idmedicamento2) {
            await this.storage.removeFromCollection(STORAGE_KEYS.INTERACOES, uuid);
            await this.carregarInteracoes();
            return true;
        }

        try {
            const token = await this.authService.getAccessToken();
            if (!token) throw new Error('Não autenticado');

            const headers = new HttpHeaders({
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            });

            await this.http.delete(
                `${this.API_URL}/interacao/${interacao.serverIds.idmedicamento1}/${interacao.serverIds.idmedicamento2}`,
                { headers }
            ).toPromise();

            await this.storage.removeFromCollection(STORAGE_KEYS.INTERACOES, uuid);
            await this.carregarInteracoes();
            console.log(`✅ Interação deletada online: ${uuid}`);
            return true;

        } catch (error: any) {
            console.error('❌ Erro ao deletar interação:', error);
            if (error.status === 0) {
                throw new Error('Sem conexão. Não foi possível deletar a interação.');
            }
            throw new Error(error.error?.erro || 'Erro ao deletar interação.');
        }
    }
}
