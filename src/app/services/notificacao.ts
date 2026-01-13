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
    public async enviarNotificacao(dto: any): Promise<NotificacaoLocal> {
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

            // Mapear UUIDs para IDs inteiros (serverId)
            // Precisamos buscar os usuários locais ou confiar que o caller passou os dados corretos.
            // O `dto.cliente_uuids` são UUIDs locais.
            // Para enviar para a API, precisamos dos IDs numéricos.

            // Vamos buscar os clientes novamente para mapear (ou otimizar isso passando o objeto cliente completo)
            // Por segurança, vamos buscar via API ou cache se possível.
            // Como `buscarClientes` já retorna a lista com `idusuario` (assumido), vamos usar um cache simples ou pedir para quem chama.
            // Mas para simplificar a assinatura, vamos fazer o lookup aqui se possível.

            // Nota: O ideal seria ter um `UsuarioService` que mapeia UUID -> ID.
            // Vou assumir que o DTO pode receber opcionalmente `cliente_uuids` E `cliente_server_ids` se o caller já souber.
            // Ou vamos iterar sobre o resultado de `buscarClientes` (que deve ser cacheado pelo caller).

            // Melhor abordagem: O caller (Tab6) tem a lista de clientes.
            // Vamos mudar a assinatura do `enviarNotificacao` para aceitar `serverIds` diretamente ou fazer o lookup.
            // Vou optar por fazer o lookup buscando os clientes novamente (cache curto) ou filtrando se tivermos acesso.
            // Dado que `buscarClientes` faz requisição HTTP, melhor não chamar de novo.

            // ALTERNATIVA: O `Tab6` passa os IDs numéricos.
            // O `Tab6` chama `buscarClientes`, que retorna objetos com `idusuario`.
            // O `Tab6` seleciona e passa.

            // Vamos atualizar o DTO recebido para esperar `cliente_server_ids` OU fazer o mapping se tivermos os dados.
            // Como não temos banco de usuários local persistido com `serverId` garantido (só `UsuarioLocal` se logado),
            // mas `buscarClientes` retorna da API.

            const payload = {
                titulo: dto.titulo,
                mensagem: dto.mensagem,
                clienteIds: dto.cliente_server_ids // Espera-se array de inteiros vindos do caller
            };

            if (!payload.clienteIds || payload.clienteIds.length === 0) {
                // Fallback: se não passou serverIds, tenta mapear (mas provavelmente falhará se não tivermos os dados)
                // Assumindo que o caller (Tab6) vai ser atualizado para passar `cliente_server_ids`
                throw new Error('IDs dos clientes não fornecidos.');
            }

            const response = await this.http.post<any>(
                `${this.API_URL}/notificacao/enviar`,
                payload,
                { headers }
            ).toPromise();

            const notificacao: NotificacaoLocal = {
                ...createBaseModel(),
                serverId: response.idnotificacao || null,
                titulo: dto.titulo,
                mensagem: dto.mensagem,
                farmaceutico_uuid: user.idusuario.toString(), // ou uuid se tiver
                cliente_uuids: dto.cliente_uuids || [], // Mantém UUIDs para referência local se fornecidos
                enviado: true,
                enviadoEm: now(),
                syncStatus: SyncStatus.SYNCED, // Já foi pro servidor
                syncedAt: now()
            };

            await this.storage.setInCollection(STORAGE_KEYS.NOTIFICACOES, notificacao.uuid, notificacao);
            await this.carregarNotificacoes();
            console.log(`✅ Notificação enviada: ${notificacao.uuid}`);
            return notificacao;

        } catch (error: any) {
            console.error('❌ Erro ao enviar notificação:', error);
            throw new Error(error.error?.mensagem || 'Erro ao enviar notificação.');
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

