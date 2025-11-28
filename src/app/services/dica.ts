import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { StorageService, STORAGE_KEYS } from './storage';
import { AuthService } from './auth';
import {
    DicaLocal,
    CriarDicaLocalDTO,
    createBaseModel,
    generateUUID,
    now,
    markAsUpdated,
    markAsDeleted,
    SyncStatus,
    dicaApiToLocal
} from '../models/local.models';

@Injectable({
    providedIn: 'root'
})
export class DicaService {

    private dicasSubject = new BehaviorSubject<DicaLocal[]>([]);
    public dicas$ = this.dicasSubject.asObservable();

    constructor(
        private storage: StorageService,
        private authService: AuthService
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
        const dica: DicaLocal = {
            ...createBaseModel(),
            texto: dto.texto,
            farmaceutico_uuid: dto.farmaceutico_uuid || generateUUID()
        };

        await this.storage.setInCollection(STORAGE_KEYS.DICAS, dica.uuid, dica);

        await this.storage.addToSyncQueue({
            id: generateUUID(),
            entity: 'dica',
            uuid: dica.uuid,
            operation: 'create',
            data: { texto: dica.texto },
            timestamp: now(),
            retries: 0,
            maxRetries: 3
        });

        await this.carregarDicas();
        return dica;
    }

    public async listar(): Promise<DicaLocal[]> {
        return this.dicasSubject.value;
    }

    public async buscarPorUuid(uuid: string): Promise<DicaLocal | null> {
        return await this.storage.getFromCollection<DicaLocal>(STORAGE_KEYS.DICAS, uuid);
    }

    public async editar(uuid: string, texto: string): Promise<DicaLocal | null> {
        const dica = await this.buscarPorUuid(uuid);
        if (!dica) return null;

        const atualizada: DicaLocal = {
            ...dica,
            texto,
            ...markAsUpdated(dica)
        };

        await this.storage.setInCollection(STORAGE_KEYS.DICAS, uuid, atualizada);

        if (dica.serverId) {
            await this.storage.addToSyncQueue({
                id: generateUUID(),
                entity: 'dica',
                uuid: dica.uuid,
                operation: 'update',
                data: { texto: atualizada.texto },
                timestamp: now(),
                retries: 0,
                maxRetries: 3
            });
        }

        await this.carregarDicas();
        return atualizada;
    }

    public async deletar(uuid: string): Promise<boolean> {
        const dica = await this.buscarPorUuid(uuid);
        if (!dica) return false;

        const deletada = markAsDeleted(dica);
        await this.storage.setInCollection(STORAGE_KEYS.DICAS, uuid, deletada);

        if (dica.serverId) {
            await this.storage.addToSyncQueue({
                id: generateUUID(),
                entity: 'dica',
                uuid: dica.uuid,
                operation: 'delete',
                data: null,
                timestamp: now(),
                retries: 0,
                maxRetries: 3
            });
        } else {
            await this.storage.removeFromCollection(STORAGE_KEYS.DICAS, uuid);
        }

        await this.carregarDicas();
        return true;
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
