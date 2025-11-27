import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { StorageService, STORAGE_KEYS } from './storage';
import {
    FaqLocal,
    faqApiToLocal
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
        this.faqSubject.next(faqs);
    }

    public async listar(): Promise<FaqLocal[]> {
        return this.faqSubject.value;
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
