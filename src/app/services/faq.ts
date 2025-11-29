import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { StorageService, STORAGE_KEYS } from './storage';
import {
    FaqLocal,
    faqApiToLocal,
    createBaseModel,
    generateUUID,
    now,
    markAsUpdated,
    markAsDeleted
} from '../models/local.models';

@Injectable({
    providedIn: 'root'
})
export class FaqService {

    private faqSubject = new BehaviorSubject<FaqLocal[]>([]);
    public faq$ = this.faqSubject.asObservable();

    constructor(
        private storage: StorageService
    ) {
        this.carregarFaqs();
    }

    private async carregarFaqs(): Promise<void> {
        const faqs = await this.storage.getCollectionAsArray<FaqLocal>(
            STORAGE_KEYS.FAQS
        );
        // Filtrar deletados localmente
        const ativos = faqs.filter(f => !f.deletedLocally);
        this.faqSubject.next(ativos);
    }

    public async listar(): Promise<FaqLocal[]> {
        return this.faqSubject.value;
    }

    public async buscarPorUuid(uuid: string): Promise<FaqLocal | null> {
        return await this.storage.getFromCollection<FaqLocal>(
            STORAGE_KEYS.FAQS,
            uuid
        );
    }

    /**
     * Cria uma nova FAQ
     */
    public async criar(dto: { pergunta: string, resposta: string, farmaceutico_uuid?: string }): Promise<FaqLocal> {
        const faq: FaqLocal = {
            ...createBaseModel(),
            pergunta: dto.pergunta,
            resposta: dto.resposta,
            farmaceutico_uuid: dto.farmaceutico_uuid || generateUUID() // Deveria ser o UUID do usuário logado
        };

        await this.storage.setInCollection(STORAGE_KEYS.FAQS, faq.uuid, faq);

        await this.storage.addToSyncQueue({
            id: generateUUID(),
            entity: 'faq',
            uuid: faq.uuid,
            operation: 'create',
            data: {
                pergunta: faq.pergunta,
                resposta: faq.resposta
            },
            timestamp: now(),
            retries: 0,
            maxRetries: 3
        });

        await this.carregarFaqs();
        return faq;
    }

    /**
     * Edita uma FAQ existente
     */
    public async editar(uuid: string, dto: { pergunta: string, resposta: string }): Promise<FaqLocal | null> {
        const faq = await this.buscarPorUuid(uuid);
        if (!faq) return null;

        const atualizado: FaqLocal = {
            ...faq,
            ...markAsUpdated(faq),
            pergunta: dto.pergunta,
            resposta: dto.resposta
        };

        await this.storage.setInCollection(STORAGE_KEYS.FAQS, uuid, atualizado);

        if (faq.serverId) {
            await this.storage.addToSyncQueue({
                id: generateUUID(),
                entity: 'faq',
                uuid: faq.uuid,
                operation: 'update',
                data: {
                    pergunta: atualizado.pergunta,
                    resposta: atualizado.resposta
                },
                timestamp: now(),
                retries: 0,
                maxRetries: 3
            });
        }

        await this.carregarFaqs();
        return atualizado;
    }

    /**
     * Deleta uma FAQ
     */
    public async deletar(uuid: string): Promise<boolean> {
        const faq = await this.buscarPorUuid(uuid);
        if (!faq) return false;

        const deletado = markAsDeleted(faq);
        await this.storage.setInCollection(STORAGE_KEYS.FAQS, uuid, deletado);

        if (faq.serverId) {
            await this.storage.addToSyncQueue({
                id: generateUUID(),
                entity: 'faq',
                uuid: faq.uuid,
                operation: 'delete',
                data: null,
                timestamp: now(),
                retries: 0,
                maxRetries: 3
            });
        } else {
            await this.storage.removeFromCollection(STORAGE_KEYS.FAQS, uuid);
        }

        await this.carregarFaqs();
        return true;
    }

    /**
     * Atualiza dados locais com dados do servidor
     */
    public async mesclarDoServidor(apiResponse: any[]): Promise<void> {
        const atuais = await this.listar();
        const mapAtuais = new Map(atuais.map(f => [f.serverId, f]));

        for (const apiFaq of apiResponse) {
            const existing = mapAtuais.get(apiFaq.idfaq);
            const updated = faqApiToLocal(apiFaq, existing);

            await this.storage.setInCollection(
                STORAGE_KEYS.FAQS,
                updated.uuid,
                updated
            );
        }

        // Atualiza observable
        await this.carregarFaqs();
    }
}
