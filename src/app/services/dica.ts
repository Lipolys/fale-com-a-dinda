import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { StorageService, STORAGE_KEYS } from './storage';
import { AuthService } from './auth';
import { environment } from '../../environments/environment';
import {
    DicaLocal,
    CriarDicaLocalDTO,
    createBaseModel,
    now,
    SyncStatus,
    dicaApiToLocal
} from '../models/local.models';

/**
 * Service para gerenciar Dicas
 * FARMACÊUTICO: Online-only - envia direto para API
 * CLIENTE: Apenas leitura
 */
@Injectable({
    providedIn: 'root'
})
export class DicaService {

    private readonly API_URL = environment.apiUrl;
    private dicasSubject = new BehaviorSubject<DicaLocal[]>([]);
    public dicas$ = this.dicasSubject.asObservable();

    constructor(
        private storage: StorageService,
        private authService: AuthService,
        private http: HttpClient
    ) {
        this.authService.isAuthenticated$.subscribe(async (isAuthenticated) => {
            if (isAuthenticated) {
                await this.carregarDicas();
            } else {
                this.dicasSubject.next([]);
            }
        });
    }

    private async carregarDicas(): Promise<void> {
        const dicas = await this.storage.getCollectionAsArray<DicaLocal>(
            STORAGE_KEYS.DICAS
        );
        const ativas = dicas.filter(d => !d.deletedLocally);
        this.dicasSubject.next(ativas);
    }

    public async criar(dto: CriarDicaLocalDTO): Promise<DicaLocal> {
        const user = await this.authService.getCurrentUser();
        if (user?.tipo_usuario !== 'FARMACEUTICO') {
            throw new Error('Apenas farmacêuticos podem criar dicas');
        }

        try {
            const token = await this.authService.getAccessToken();
            if (!token) throw new Error('Não autenticado');

            const headers = new HttpHeaders({
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            });

            const response = await this.http.post<any>(
                `${this.API_URL}/dica`,
                { texto: dto.texto },
                { headers }
            ).toPromise();

            const dica: DicaLocal = {
                ...createBaseModel(),
                serverId: response.iddica,
                texto: response.texto,
                farmaceutico_uuid: dto.farmaceutico_uuid || '',
                syncStatus: SyncStatus.SYNCED,
                syncedAt: now()
            };

            await this.storage.setInCollection(STORAGE_KEYS.DICAS, dica.uuid, dica);
            await this.carregarDicas();
            console.log(`✅ Dica criada online: ${dica.uuid}`);
            return dica;

        } catch (error: any) {
            console.error('❌ Erro ao criar dica:', error);
            if (error.status === 0) {
                throw new Error('Sem conexão. Não foi possível criar a dica.');
            }
            throw new Error(error.error?.erro || 'Erro ao criar dica.');
        }
    }

    public async listar(): Promise<DicaLocal[]> {
        return this.dicasSubject.value;
    }

    public async buscarPorUuid(uuid: string): Promise<DicaLocal | null> {
        return await this.storage.getFromCollection<DicaLocal>(STORAGE_KEYS.DICAS, uuid);
    }

    public async editar(uuid: string, texto: string): Promise<DicaLocal | null> {
        const user = await this.authService.getCurrentUser();
        const dica = await this.buscarPorUuid(uuid);
        if (!dica) return null;

        if (user?.tipo_usuario !== 'FARMACEUTICO') {
            throw new Error('Apenas farmacêuticos podem editar dicas');
        }

        try {
            if (!dica.serverId) throw new Error('Dica não sincronizada');

            const token = await this.authService.getAccessToken();
            if (!token) throw new Error('Não autenticado');

            const headers = new HttpHeaders({
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            });

            await this.http.put(
                `${this.API_URL}/dica/${dica.serverId}`,
                { texto },
                { headers }
            ).toPromise();

            const atualizada: DicaLocal = {
                ...dica,
                texto,
                updatedAt: now(),
                syncedAt: now()
            };

            await this.storage.setInCollection(STORAGE_KEYS.DICAS, uuid, atualizada);
            await this.carregarDicas();
            console.log(`✅ Dica editada online: ${uuid}`);
            return atualizada;

        } catch (error: any) {
            console.error('❌ Erro ao editar dica:', error);
            if (error.status === 0) {
                throw new Error('Sem conexão. Não foi possível editar a dica.');
            }
            throw new Error(error.error?.erro || 'Erro ao editar dica.');
        }
    }

    public async deletar(uuid: string): Promise<boolean> {
        const user = await this.authService.getCurrentUser();
        const dica = await this.buscarPorUuid(uuid);
        if (!dica) return false;

        if (user?.tipo_usuario !== 'FARMACEUTICO') {
            throw new Error('Apenas farmacêuticos podem deletar dicas');
        }

        try {
            if (!dica.serverId) throw new Error('Dica não sincronizada');

            const token = await this.authService.getAccessToken();
            if (!token) throw new Error('Não autenticado');

            const headers = new HttpHeaders({
                'Authorization': `Bearer ${token}`
            });

            await this.http.delete(
                `${this.API_URL}/dica/${dica.serverId}`,
                { headers }
            ).toPromise();

            await this.storage.removeFromCollection(STORAGE_KEYS.DICAS, uuid);
            await this.carregarDicas();
            console.log(`✅ Dica deletada online: ${uuid}`);
            return true;

        } catch (error: any) {
            console.error('❌ Erro ao deletar dica:', error);
            if (error.status === 0) {
                throw new Error('Sem conexão. Não foi possível deletar a dica.');
            }
            throw new Error(error.error?.erro || 'Erro ao deletar dica.');
        }
    }

    public async mesclarDoServidor(apiResponse: any[]): Promise<void> {
        if (!apiResponse || apiResponse.length === 0) return;

        const locais = await this.storage.getCollection<DicaLocal>(STORAGE_KEYS.DICAS);

        for (const apiDica of apiResponse) {
            const existente = Object.values(locais).find(d => d.serverId === apiDica.iddica);

            if (existente) {
                const serverTime = new Date(apiDica.updatedAt || apiDica.createdAt).getTime();
                const localTime = new Date(existente.updatedAt).getTime();

                if (serverTime > localTime && existente.syncStatus === SyncStatus.SYNCED) {
                    const atualizada = dicaApiToLocal(apiDica, existente);
                    locais[existente.uuid] = atualizada;
                    await this.storage.setInCollection(STORAGE_KEYS.DICAS, existente.uuid, atualizada);
                }
            } else {
                const nova = dicaApiToLocal(apiDica);
                locais[nova.uuid] = nova;
            }
        }

        await this.storage.setCollection(STORAGE_KEYS.DICAS, locais);
        await this.carregarDicas();
    }
}
