import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { StorageService, STORAGE_KEYS } from './storage';
import { AuthService } from './auth';
import { environment } from '../../environments/environment';
import {
    NotificacaoLocal,
    CriarNotificacaoDTO,
    createBaseModel,
    now,
    SyncStatus
} from '../models/local.models';

/**
 * Service para gerenciar Notificações de Dicas
 * Farmacêutico pode enviar dicas como notificações para clientes selecionados
 */
@Injectable({
    providedIn: 'root'
})
export class NotificacaoService {

    private readonly API_URL = environment.apiUrl;
    private notificacoesSubject = new BehaviorSubject<NotificacaoLocal[]>([]);
    public notificacoes$ = this.notificacoesSubject.asObservable();

    constructor(
        private storage: StorageService,
        private authService: AuthService,
        private http: HttpClient
    ) {
        this.authService.isAuthenticated$.subscribe(async (isAuthenticated) => {
            if (isAuthenticated) {
                await this.carregarNotificacoes();
            } else {
                this.notificacoesSubject.next([]);
            }
        });
    }

    private async carregarNotificacoes(): Promise<void> {
        const notificacoes = await this.storage.getCollectionAsArray<NotificacaoLocal>(
            STORAGE_KEYS.NOTIFICACOES
        );
        const ativas = notificacoes.filter(n => !n.deletedLocally);
        this.notificacoesSubject.next(ativas);
    }

    /**
     * Criar e enviar notificação para clientes
     */
    public async enviarNotificacao(dto: CriarNotificacaoDTO): Promise<NotificacaoLocal> {
        const user = await this.authService.getCurrentUser();
        if (user?.tipo_usuario !== 'FARMACEUTICO') {
            throw new Error('Apenas farmacêuticos podem enviar notificações');
        }

        try {
            const token = await this.authService.getAccessToken();
            if (!token) throw new Error('Não autenticado');

            const headers = new HttpHeaders({
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            });

            // API endpoint para enviar notificação
            // Presumindo que existe um endpoint /notificacao no backend
            const payload = {
                dica_uuid: dto.dica_uuid,
                cliente_uuids: dto.cliente_uuids,
                enviarParaTodos: dto.enviarParaTodos || false
            };

            const response = await this.http.post<any>(
                `${this.API_URL}/notificacao`,
                payload,
                { headers }
            ).toPromise();

            const notificacao: NotificacaoLocal = {
                ...createBaseModel(),
                serverId: response.idnotificacao || null,
                dica_uuid: dto.dica_uuid,
                farmaceutico_uuid: user.idusuario.toString(),
                cliente_uuids: dto.cliente_uuids,
                enviado: true,
                enviadoEm: now(),
                syncStatus: SyncStatus.SYNCED,
                syncedAt: now()
            };

            await this.storage.setInCollection(STORAGE_KEYS.NOTIFICACOES, notificacao.uuid, notificacao);
            await this.carregarNotificacoes();
            console.log(`✅ Notificação enviada: ${notificacao.uuid}`);
            return notificacao;

        } catch (error: any) {
            console.error('❌ Erro ao enviar notificação:', error);

            // Salvar como pendente se estiver offline
            if (error.status === 0) {
                const notificacao: NotificacaoLocal = {
                    ...createBaseModel(),
                    serverId: null,
                    dica_uuid: dto.dica_uuid,
                    farmaceutico_uuid: user.idusuario.toString(),
                    cliente_uuids: dto.cliente_uuids,
                    enviado: false,
                    erroEnvio: 'Sem conexão',
                    syncStatus: SyncStatus.PENDING_CREATE,
                    syncedAt: null
                };

                await this.storage.setInCollection(STORAGE_KEYS.NOTIFICACOES, notificacao.uuid, notificacao);
                await this.carregarNotificacoes();
                throw new Error('Sem conexão. Notificação salva para envio posterior.');
            }

            throw new Error(error.error?.erro || 'Erro ao enviar notificação.');
        }
    }

    /**
     * Listar notificações enviadas
     */
    public async listar(): Promise<NotificacaoLocal[]> {
        return this.notificacoesSubject.value;
    }

    /**
     * Buscar notificações por dica
     */
    public async buscarPorDica(dicaUuid: string): Promise<NotificacaoLocal[]> {
        const todas = await this.listar();
        return todas.filter(n => n.dica_uuid === dicaUuid);
    }

    /**
     * Reenviar notificação (criar nova notificação com mesma dica)
     */
    public async reenviar(dicaUuid: string, clienteUuids: string[]): Promise<NotificacaoLocal> {
        return this.enviarNotificacao({
            dica_uuid: dicaUuid,
            cliente_uuids: clienteUuids
        });
    }

    /**
     * Buscar clientes (usuários do tipo CLIENTE)
     * Esta função deve buscar da API ou storage local
     */
    public async buscarClientes(): Promise<any[]> {
        try {
            const token = await this.authService.getAccessToken();
            if (!token) throw new Error('Não autenticado');

            const headers = new HttpHeaders({
                'Authorization': `Bearer ${token}`
            });

            // Presumindo endpoint para listar clientes
            const response = await this.http.get<any[]>(
                `${this.API_URL}/usuario/clientes`,
                { headers }
            ).toPromise();

            return response || [];

        } catch (error: any) {
            console.error('❌ Erro ao buscar clientes:', error);
            // Se offline, retornar array vazio ou cache local se existir
            return [];
        }
    }
}

