import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { StorageService, STORAGE_KEYS } from './storage';
import {
    InteracaoLocal,
    interacaoApiToLocal,
    MedicamentoLocal
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
        this.interacaoSubject.next(interacoes);
    }

    public async listar(): Promise<InteracaoLocal[]> {
        return this.interacaoSubject.value;
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
}
