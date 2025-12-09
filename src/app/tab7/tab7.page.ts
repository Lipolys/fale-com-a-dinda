import { Component, OnInit, OnDestroy } from '@angular/core';
import { MedicamentoService } from '../services/medicamento';
import { InteracaoService } from '../services/interacao';
import { MedicamentoLocal, InteracaoLocal } from '../models/local.models';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-tab7',
    templateUrl: 'tab7.page.html',
    styleUrls: ['tab7.page.scss'],
    standalone: false,
})
export class Tab7Page implements OnInit, OnDestroy {

    medicamentos: MedicamentoLocal[] = [];
    medicamentosFiltrados: MedicamentoLocal[] = [];
    interacoes: InteracaoLocal[] = [];
    termoBusca: string = '';

    // Mapa de interações por medicamento (uuid -> interações)
    interacoesPorMedicamento: Map<string, InteracaoLocal[]> = new Map();

    private subscriptions: Subscription[] = [];

    constructor(
        private medicamentoService: MedicamentoService,
        private interacaoService: InteracaoService
    ) { }

    ngOnInit() {
        this.setupSubscriptions();
    }

    private setupSubscriptions(): void {
        // Subscreve à lista de medicamentos
        const medSub = this.medicamentoService.medicamentos$.subscribe(
            medicamentos => {
                this.medicamentos = medicamentos;
                this.filtrarMedicamentos();
            }
        );
        this.subscriptions.push(medSub);

        // Subscreve à lista de interações
        const intSub = this.interacaoService.interacao$.subscribe(
            interacoes => {
                this.interacoes = interacoes;
                this.construirMapaInteracoes();
            }
        );
        this.subscriptions.push(intSub);
    }

    ngOnDestroy() {
        this.subscriptions.forEach(sub => sub.unsubscribe());
    }

    /**
     * Filtra medicamentos pelo termo de busca
     */
    filtrarMedicamentos(): void {
        if (!this.termoBusca.trim()) {
            this.medicamentosFiltrados = this.medicamentos;
        } else {
            const termo = this.termoBusca.toLowerCase().trim();
            this.medicamentosFiltrados = this.medicamentos.filter(m =>
                m.nome.toLowerCase().includes(termo) ||
                m.classe?.toLowerCase().includes(termo)
            );
        }
    }

    /**
     * Handler para mudança no searchbar
     */
    onSearchChange(event: any): void {
        this.termoBusca = event.detail.value || '';
        this.filtrarMedicamentos();
    }

    /**
     * Constrói mapa de interações por medicamento para acesso rápido
     */
    private construirMapaInteracoes(): void {
        this.interacoesPorMedicamento.clear();

        this.interacoes.forEach(interacao => {
            // Adiciona interação para o medicamento 1
            const lista1 = this.interacoesPorMedicamento.get(interacao.medicamento1_uuid) || [];
            lista1.push(interacao);
            this.interacoesPorMedicamento.set(interacao.medicamento1_uuid, lista1);

            // Adiciona interação para o medicamento 2
            const lista2 = this.interacoesPorMedicamento.get(interacao.medicamento2_uuid) || [];
            lista2.push(interacao);
            this.interacoesPorMedicamento.set(interacao.medicamento2_uuid, lista2);
        });
    }

    /**
     * Retorna interações de um medicamento específico
     */
    getInteracoesMedicamento(medicamentoUuid: string): InteracaoLocal[] {
        return this.interacoesPorMedicamento.get(medicamentoUuid) || [];
    }

    /**
     * Retorna o nome do outro medicamento na interação
     */
    getOutroMedicamento(interacao: InteracaoLocal, medicamentoAtualUuid: string): string {
        if (interacao.medicamento1_uuid === medicamentoAtualUuid) {
            return interacao.medicamento2_nome || 'Medicamento desconhecido';
        }
        return interacao.medicamento1_nome || 'Medicamento desconhecido';
    }

    /**
     * Retorna cor do badge de gravidade
     */
    getCorGravidade(gravidade: string): string {
        switch (gravidade) {
            case 'BAIXA': return 'success';
            case 'MEDIA': return 'warning';
            case 'ALTA': return 'danger';
            default: return 'medium';
        }
    }

    /**
     * Retorna texto amigável para gravidade
     */
    getTextoGravidade(gravidade: string): string {
        switch (gravidade) {
            case 'BAIXA': return 'Baixa';
            case 'MEDIA': return 'Média';
            case 'ALTA': return 'Alta';
            default: return gravidade;
        }
    }

    /**
     * Verifica se medicamento tem interações
     */
    temInteracoes(medicamentoUuid: string): boolean {
        return this.getInteracoesMedicamento(medicamentoUuid).length > 0;
    }

    /**
     * Conta interações de um medicamento
     */
    contarInteracoes(medicamentoUuid: string): number {
        return this.getInteracoesMedicamento(medicamentoUuid).length;
    }
}
