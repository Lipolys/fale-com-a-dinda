import { Component, OnInit } from '@angular/core';
import { ModalController, AlertController, ToastController } from '@ionic/angular';
import { InteracaoService } from '../services/interacao';
import { MedicamentoService } from '../services/medicamento';
import { InteracaoLocal, MedicamentoLocal } from '../models/local.models';

@Component({
    selector: 'app-interacoes-manager',
    templateUrl: './interacoes-manager.page.html',
    styleUrls: ['./interacoes-manager.page.scss'],
})
export class InteracoesManagerPage implements OnInit {

    interacoes: InteracaoLocal[] = [];
    medicamentos: MedicamentoLocal[] = [];

    constructor(
        private modalCtrl: ModalController,
        private interacaoService: InteracaoService,
        private medicamentoService: MedicamentoService,
        private alertCtrl: AlertController,
        private toastCtrl: ToastController
    ) { }

    async ngOnInit() {
        this.carregarDados();
    }

    async carregarDados() {
        this.interacoes = await this.interacaoService.listar();
        this.medicamentos = await this.medicamentoService.listar();
    }

    fechar() {
        this.modalCtrl.dismiss();
    }

    async adicionarInteracao() {
        const alert = await this.alertCtrl.create({
            header: 'Nova Interação',
            message: 'Selecione os dois medicamentos (simulação: digite os nomes exatos por enquanto)',
            inputs: [
                {
                    name: 'med1_nome',
                    type: 'text',
                    placeholder: 'Nome do Medicamento 1'
                },
                {
                    name: 'med2_nome',
                    type: 'text',
                    placeholder: 'Nome do Medicamento 2'
                },
                {
                    name: 'descricao',
                    type: 'textarea',
                    placeholder: 'Descrição da Interação'
                },
                {
                    name: 'gravidade',
                    type: 'text',
                    placeholder: 'Gravidade (BAIXA, MEDIA, ALTA)'
                }
            ],
            buttons: [
                {
                    text: 'Cancelar',
                    role: 'cancel'
                },
                {
                    text: 'Salvar',
                    handler: async (data) => {
                        await this.processarCriacao(data);
                    }
                }
            ]
        });
        await alert.present();
    }

    async processarCriacao(data: any) {
        // Busca UUIDs pelos nomes
        const med1 = this.medicamentos.find(m => m.nome.toLowerCase() === data.med1_nome.toLowerCase());
        const med2 = this.medicamentos.find(m => m.nome.toLowerCase() === data.med2_nome.toLowerCase());

        if (!med1 || !med2) {
            this.mostrarToast('Medicamentos não encontrados. Digite o nome exato.', 'warning');
            return;
        }

        if (!['BAIXA', 'MEDIA', 'ALTA'].includes(data.gravidade.toUpperCase())) {
            this.mostrarToast('Gravidade inválida. Use BAIXA, MEDIA ou ALTA.', 'warning');
            return;
        }

        try {
            await this.interacaoService.criar({
                medicamento1_uuid: med1.uuid,
                medicamento2_uuid: med2.uuid,
                descricao: data.descricao,
                gravidade: data.gravidade.toUpperCase() as any
            });
            this.mostrarToast('Interação criada!', 'success');
            this.carregarDados();
        } catch (error: any) {
            this.mostrarToast('Erro: ' + error.message, 'danger');
        }
    }

    async removerInteracao(interacao: InteracaoLocal) {
        const alert = await this.alertCtrl.create({
            header: 'Confirmar',
            message: 'Excluir esta interação?',
            buttons: [
                { text: 'Não', role: 'cancel' },
                {
                    text: 'Sim',
                    handler: async () => {
                        await this.interacaoService.deletar(interacao.uuid);
                        this.carregarDados();
                        this.mostrarToast('Removido!', 'success');
                    }
                }
            ]
        });
        await alert.present();
    }

    async mostrarToast(msg: string, color: string) {
        const toast = await this.toastCtrl.create({
            message: msg,
            duration: 2000,
            color: color
        });
        toast.present();
    }

}
