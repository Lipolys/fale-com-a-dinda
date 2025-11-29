import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { StorageService, STORAGE_KEYS } from './storage';
import {
    InteracaoLocal,
    interacaoApiToLocal,
    MedicamentoLocal,
    createBaseModel,
    generateUUID,
    now,
    markAsUpdated,
    markAsDeleted
} from '../models/local.models';
import { MedicamentoService } from './medicamento';

@Injectable({
    providedIn: 'root'
})
export class InteracaoService {

    private interacaoSubject = new BehaviorSubject<InteracaoLocal[]>([]);
    public interacao$ = this.interacaoSubject.asObservable();

    constructor(
        private storage: StorageService,
        private medicamentoService: MedicamentoService
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

        for (const medUuid of listaMedsUuids) {
            // Verifica se existe interação entre novoMedUuid e medUuid
            // A interação pode estar cadastrada como (med1, med2) ou (med2, med1)
            const interacao = todasInteracoes.find(i =>
                (i.medicamento1_uuid === novoMedUuid && i.medicamento2_uuid === medUuid) ||
                (i.medicamento1_uuid === medUuid && i.medicamento2_uuid === novoMedUuid)
            );

            if (interacao) {
                interacoesEncontradas.push(interacao);
            }
        }

        return interacoesEncontradas;
    }

    public async mesclarDoServidor(apiResponse: any[]): Promise<void> {
        // Preciso dos medicamentos para resolver IDs -> UUIDs
        const medicamentos = await this.medicamentoService.listar();
        const mapIdToUuid = new Map<number, string>();
        medicamentos.forEach(m => {
            if (m.serverId) mapIdToUuid.set(m.serverId, m.uuid);
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

            if (med1Uuid && med2Uuid) {
                const existing = mapAtuais.get(key);
                const updated = interacaoApiToLocal(apiInteracao, med1Uuid, med2Uuid, existing);

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
        // Busca nomes para facilitar display
        const med1 = await this.medicamentoService.buscarPorUuid(dados.medicamento1_uuid);
        const med2 = await this.medicamentoService.buscarPorUuid(dados.medicamento2_uuid);

        if (!med1 || !med2) {
            throw new Error('Medicamentos não encontrados para criar interação');
        }

        const interacao: InteracaoLocal = {
            ...createBaseModel(),
            medicamento1_uuid: dados.medicamento1_uuid,
            medicamento2_uuid: dados.medicamento2_uuid,
            medicamento1_nome: med1.nome,
            medicamento2_nome: med2.nome,
            descricao: dados.descricao,
            gravidade: dados.gravidade,
            farmaceutico_uuid: generateUUID(), // TODO: Usar usuário logado
            fonte: null
        };

        await this.storage.setInCollection(STORAGE_KEYS.INTERACOES, interacao.uuid, interacao);

        await this.storage.addToSyncQueue({
            id: generateUUID(),
            entity: 'interacao',
            uuid: interacao.uuid,
            operation: 'create',
            data: {
                medicamento1_uuid: interacao.medicamento1_uuid,
                medicamento2_uuid: interacao.medicamento2_uuid,
                descricao: interacao.descricao,
                gravidade: interacao.gravidade
            },
            timestamp: now(),
            retries: 0,
            maxRetries: 3
        });

        await this.carregarInteracoes();
        return interacao;
    }

    public async editar(uuid: string, dados: {
        descricao: string,
        gravidade: 'BAIXA' | 'MEDIA' | 'ALTA'
    }): Promise<InteracaoLocal | null> {
        const interacao = await this.buscarPorUuid(uuid);
        if (!interacao) return null;

        const atualizado: InteracaoLocal = {
            ...interacao,
            ...markAsUpdated(interacao),
            descricao: dados.descricao,
            gravidade: dados.gravidade
        };

        await this.storage.setInCollection(STORAGE_KEYS.INTERACOES, uuid, atualizado);

        if (interacao.serverId) {
            // Nota: Interações geralmente são identificadas por IDs compostos no servidor
            // A lógica de update no servidor pode ser complexa se a chave primária mudar
            // Aqui assumimos que apenas descrição e gravidade mudam
            await this.storage.addToSyncQueue({
                id: generateUUID(),
                entity: 'interacao',
                uuid: interacao.uuid,
                operation: 'update',
                data: {
                    descricao: atualizado.descricao,
                    gravidade: atualizado.gravidade
                },
                timestamp: now(),
                retries: 0,
                maxRetries: 3
            });
        }

        await this.carregarInteracoes();
        return atualizado;
    }

    public async deletar(uuid: string): Promise<boolean> {
        const interacao = await this.buscarPorUuid(uuid);
        if (!interacao) return false;

        const deletado = markAsDeleted(interacao);
        await this.storage.setInCollection(STORAGE_KEYS.INTERACOES, uuid, deletado);

        if (interacao.serverId) {
            await this.storage.addToSyncQueue({
                id: generateUUID(),
                entity: 'interacao',
                uuid: interacao.uuid,
                operation: 'delete',
                data: null,
                timestamp: now(),
                retries: 0,
                maxRetries: 3
            });
        } else {
            await this.storage.removeFromCollection(STORAGE_KEYS.INTERACOES, uuid);
        }

        await this.carregarInteracoes();
        return true;
    }
}
