import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { StorageService, STORAGE_KEYS } from './storage';
import { AuthService } from './auth';
import { environment } from '../../environments/environment';
import {
    FaqLocal,
    faqApiToLocal,
    createBaseModel,
    now,
    SyncStatus
} from '../models/local.models';

/**
 * Service para gerenciar FAQs
 * FARMACÊUTICO: Online-only - envia direto para API
 * CLIENTE: Apenas leitura
 */
@Injectable({
    providedIn: 'root'
})
export class FaqService {

    private readonly API_URL = environment.apiUrl;
    private faqSubject = new BehaviorSubject<FaqLocal[]>([]);
    public faq$ = this.faqSubject.asObservable();

    constructor(
        private storage: StorageService,
        private authService: AuthService,
        private http: HttpClient
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
     * FARMACÊUTICO: Envia direto para API (online-only)
     */
    public async criar(dto: { pergunta: string, resposta: string, farmaceutico_uuid?: string }): Promise<FaqLocal> {
        const user = await this.authService.getCurrentUser();

        if (user?.tipo_usuario === 'FARMACEUTICO') {
            return await this.criarOnline(dto);
        } else {
            throw new Error('Apenas farmacêuticos podem criar FAQs');
        }
    }

    private async criarOnline(dto: { pergunta: string, resposta: string, farmaceutico_uuid?: string }): Promise<FaqLocal> {
        try {
            const token = await this.authService.getAccessToken();
            if (!token) throw new Error('Não autenticado');

            const headers = new HttpHeaders({
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            });

            const response = await this.http.post<any>(
                `${this.API_URL}/faq`,
                { pergunta: dto.pergunta, resposta: dto.resposta },
                { headers }
            ).toPromise();

            const faq: FaqLocal = {
                ...createBaseModel(),
                serverId: response.idfaq,
                pergunta: response.pergunta,
                resposta: response.resposta,
                farmaceutico_uuid: dto.farmaceutico_uuid || '',
                syncStatus: SyncStatus.SYNCED,
                syncedAt: now()
            };

            await this.storage.setInCollection(STORAGE_KEYS.FAQS, faq.uuid, faq);
            await this.carregarFaqs();
            console.log(`✅ FAQ criada online: ${faq.uuid}`);
            return faq;

        } catch (error: any) {
            console.error('❌ Erro ao criar FAQ:', error);
            if (error.status === 0) {
                throw new Error('Sem conexão. Não foi possível criar a FAQ.');
            }
            throw new Error(error.error?.erro || 'Erro ao criar FAQ.');
        }
    }

    /**
     * Edita uma FAQ existente
     * FARMACÊUTICO: Envia direto para API (online-only)
     */
    public async editar(uuid: string, dto: { pergunta: string, resposta: string }): Promise<FaqLocal | null> {
        const user = await this.authService.getCurrentUser();
        const faq = await this.buscarPorUuid(uuid);
        if (!faq) return null;

        if (user?.tipo_usuario === 'FARMACEUTICO') {
            return await this.editarOnline(faq, dto);
        } else {
            throw new Error('Apenas farmacêuticos podem editar FAQs');
        }
    }

    private async editarOnline(faq: FaqLocal, dto: { pergunta: string, resposta: string }): Promise<FaqLocal | null> {
        try {
            if (!faq.serverId) throw new Error('FAQ não sincronizada');

            const token = await this.authService.getAccessToken();
            if (!token) throw new Error('Não autenticado');

            const headers = new HttpHeaders({
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            });

            await this.http.put(
                `${this.API_URL}/faq/${faq.serverId}`,
                dto,
                { headers }
            ).toPromise();

            const atualizado: FaqLocal = {
                ...faq,
                pergunta: dto.pergunta,
                resposta: dto.resposta,
                updatedAt: now(),
                syncedAt: now()
            };

            await this.storage.setInCollection(STORAGE_KEYS.FAQS, faq.uuid, atualizado);
            await this.carregarFaqs();
            console.log(`✅ FAQ editada online: ${faq.uuid}`);
            return atualizado;

        } catch (error: any) {
            console.error('❌ Erro ao editar FAQ:', error);
            if (error.status === 0) {
                throw new Error('Sem conexão. Não foi possível editar a FAQ.');
            }
            throw new Error(error.error?.erro || 'Erro ao editar FAQ.');
        }
    }

    /**
     * Deleta uma FAQ
     * FARMACÊUTICO: Envia direto para API (online-only)
     */
    public async deletar(uuid: string): Promise<boolean> {
        const user = await this.authService.getCurrentUser();
        const faq = await this.buscarPorUuid(uuid);
        if (!faq) return false;

        if (user?.tipo_usuario === 'FARMACEUTICO') {
            return await this.deletarOnline(faq);
        } else {
            throw new Error('Apenas farmacêuticos podem deletar FAQs');
        }
    }

    private async deletarOnline(faq: FaqLocal): Promise<boolean> {
        try {
            if (!faq.serverId) throw new Error('FAQ não sincronizada');

            const token = await this.authService.getAccessToken();
            if (!token) throw new Error('Não autenticado');

            const headers = new HttpHeaders({
                'Authorization': `Bearer ${token}`
            });

            await this.http.delete(
                `${this.API_URL}/faq/${faq.serverId}`,
                { headers }
            ).toPromise();

            await this.storage.removeFromCollection(STORAGE_KEYS.FAQS, faq.uuid);
            await this.carregarFaqs();
            console.log(`✅ FAQ deletada online: ${faq.uuid}`);
            return true;

        } catch (error: any) {
            console.error('❌ Erro ao deletar FAQ:', error);
            if (error.status === 0) {
                throw new Error('Sem conexão. Não foi possível deletar a FAQ.');
            }
            throw new Error(error.error?.erro || 'Erro ao deletar FAQ.');
        }
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
