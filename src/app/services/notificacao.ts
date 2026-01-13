import { Injectable, inject } from '@angular/core';
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
    private storage = inject(StorageService);
    private authService = inject(AuthService);
    private http = inject(HttpClient);


    private readonly API_URL = environment.apiUrl;
    private notificacoesSubject = new BehaviorSubject<NotificacaoLocal[]>([]);
    public notificacoes$ = this.notificacoesSubject.asObservable();

    constructor() {
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
     * @param dto Deve conter: titulo, mensagem, cliente_server_ids (array de inteiros)
     */
    public async enviarNotificacao(dto: CriarNotificacaoDTO | any): Promise<NotificacaoLocal> {
        const user = await this.authService.getCurrentUser();
        if (user?.tipo_usuario !== 'FARMACEUTICO') {
            throw new Error('Apenas farmacêuticos podem enviar notificações');
        }

        try {
            const token = await this.authService.getAccessToken();
            if (!token) throw new Error('Não autenticado');

            // Validar campos obrigatórios
            if (!dto.titulo || !dto.titulo.trim()) {
                throw new Error('Título da notificação é obrigatório');
            }
            if (!dto.mensagem || !dto.mensagem.trim()) {
                throw new Error('Mensagem da notificação é obrigatória');
            }
            if (!dto.cliente_server_ids || dto.cliente_server_ids.length === 0) {
                throw new Error('Selecione pelo menos um destinatário');
            }

            const headers = new HttpHeaders({
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            });

            // Construir payload conforme esperado pela API
            // Referência: API_NOTIFICACOES.md - POST /enviar
            // Campos obrigatórios: titulo (String), mensagem (String), clienteIds (Array[Int])
            const payload = {
                titulo: dto.titulo.trim(),
                mensagem: dto.mensagem.trim(),
                clienteIds: dto.cliente_server_ids // Array de inteiros (IDs dos usuários do servidor)
            };

            console.log('📤 Enviando notificação para API:', payload);

            const response = await this.http.post<any>(
                `${this.API_URL}/notificacao/enviar`,
                payload,
                { headers }
            ).toPromise();

            console.log('✅ Resposta da API:', response);

            const notificacao: NotificacaoLocal = {
                ...createBaseModel(),
                serverId: response?.idnotificacao || null,
                titulo: dto.titulo.trim(),
                mensagem: dto.mensagem.trim(),
                farmaceutico_uuid: user.idusuario?.toString() || 'unknown',
                cliente_uuids: dto.cliente_uuids || [],
                enviado: true,
                enviadoEm: now(),
                syncStatus: SyncStatus.SYNCED,
                syncedAt: now()
            };

            await this.storage.setInCollection(STORAGE_KEYS.NOTIFICACOES, notificacao.uuid, notificacao);
            await this.carregarNotificacoes();
            console.log(`✅ Notificação salva localmente: ${notificacao.uuid}`);
            return notificacao;

        } catch (error: any) {
            console.error('❌ Erro ao enviar notificação:', error);
            const mensagem = error.error?.mensagem || error.message || 'Erro ao enviar notificação';
            throw new Error(mensagem);
        }
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
