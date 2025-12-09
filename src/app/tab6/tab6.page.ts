import { Component, OnInit } from '@angular/core';
import { AlertController, ModalController, ToastController } from '@ionic/angular';
import { DicaService } from '../services/dica';
import { NotificacaoService } from '../services/notificacao';
import { DicaLocal } from '../models/local.models';

@Component({
  selector: 'app-tab6',
  templateUrl: './tab6.page.html',
  styleUrls: ['./tab6.page.scss'],
  standalone: false
})
export class Tab6Page implements OnInit {

  dicas: DicaLocal[] = [];
  loading = false;

  constructor(
    private dicaService: DicaService,
    private notificacaoService: NotificacaoService,
    private alertController: AlertController,
    private modalController: ModalController,
    private toastController: ToastController
  ) {}

  async ngOnInit() {
    await this.carregarDicas();
  }

  async carregarDicas() {
    this.loading = true;
    try {
      this.dicas = await this.dicaService.listar();
    } catch (error) {
      console.error('Erro ao carregar dicas:', error);
    } finally {
      this.loading = false;
    }
  }

  async criarDica() {
    const alert = await this.alertController.create({
      header: 'Nova Dica',
      inputs: [
        {
          name: 'texto',
          type: 'textarea',
          placeholder: 'Digite a dica de saúde',
          attributes: {
            rows: 6
          }
        }
      ],
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Criar',
          handler: async (data) => {
            if (!data.texto || data.texto.trim() === '') {
              this.mostrarToast('Preencha o texto da dica', 'warning');
              return false;
            }
            await this.salvarDica(data.texto);
            return true;
          }
        }
      ]
    });

    await alert.present();
  }

  async salvarDica(texto: string) {
    this.loading = true;
    try {
      const dica = await this.dicaService.criar({ texto });
      this.mostrarToast('Dica criada com sucesso!', 'success');

      // Perguntar se deseja enviar notificação agora
      const alertEnviar = await this.alertController.create({
        header: 'Enviar Notificação?',
        message: 'Deseja enviar esta dica como notificação para seus clientes agora?',
        buttons: [
          {
            text: 'Agora não',
            role: 'cancel'
          },
          {
            text: 'Sim, enviar',
            handler: async () => {
              await this.enviarNotificacao(dica);
            }
          }
        ]
      });
      await alertEnviar.present();

      await this.carregarDicas();
    } catch (error: any) {
      this.mostrarToast(error.message || 'Erro ao criar dica', 'danger');
    } finally {
      this.loading = false;
    }
  }

  async editarDica(dica: DicaLocal) {
    const alert = await this.alertController.create({
      header: 'Editar Dica',
      inputs: [
        {
          name: 'texto',
          type: 'textarea',
          placeholder: 'Digite a dica de saúde',
          value: dica.texto,
          attributes: {
            rows: 6
          }
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
            if (!data.texto || data.texto.trim() === '') {
              this.mostrarToast('Preencha o texto da dica', 'warning');
              return false;
            }
            await this.atualizarDica(dica.uuid, data.texto);
            return true;
          }
        }
      ]
    });

    await alert.present();
  }

  async atualizarDica(uuid: string, texto: string) {
    this.loading = true;
    try {
      await this.dicaService.editar(uuid, texto);
      this.mostrarToast('Dica atualizada com sucesso!', 'success');
      await this.carregarDicas();
    } catch (error: any) {
      this.mostrarToast(error.message || 'Erro ao atualizar dica', 'danger');
    } finally {
      this.loading = false;
    }
  }

  async confirmarDeletar(dica: DicaLocal) {
    const previewTexto = dica.texto.length > 50 ? dica.texto.substring(0, 50) + '...' : dica.texto;
    const alert = await this.alertController.create({
      header: 'Confirmar Exclusão',
      message: `Deseja realmente excluir a dica "${previewTexto}"?`,
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Excluir',
          role: 'destructive',
          handler: async () => {
            await this.deletarDica(dica.uuid);
          }
        }
      ]
    });

    await alert.present();
  }

  async deletarDica(uuid: string) {
    this.loading = true;
    try {
      await this.dicaService.deletar(uuid);
      this.mostrarToast('Dica excluída com sucesso!', 'success');
      await this.carregarDicas();
    } catch (error: any) {
      this.mostrarToast(error.message || 'Erro ao excluir dica', 'danger');
    } finally {
      this.loading = false;
    }
  }

  async enviarNotificacao(dica: DicaLocal) {
    const clientes = await this.notificacaoService.buscarClientes();
    const previewTexto = dica.texto.length > 50 ? dica.texto.substring(0, 50) + '...' : dica.texto;

    const inputs: any[] = [
      {
        name: 'todos',
        type: 'checkbox',
        label: 'Enviar para todos os clientes',
        value: 'todos',
        checked: false
      }
    ];

    // Adicionar checkbox para cada cliente
    clientes.forEach(cliente => {
      inputs.push({
        name: cliente.uuid,
        type: 'checkbox',
        label: `${cliente.nome} (${cliente.email})`,
        value: cliente.uuid,
        checked: false
      });
    });

    const alert = await this.alertController.create({
      header: 'Enviar Notificação',
      message: `Selecione os destinatários da dica: "${previewTexto}"`,
      inputs: inputs,
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Enviar',
          handler: async (data) => {
            if (!data || data.length === 0) {
              this.mostrarToast('Selecione pelo menos um destinatário', 'warning');
              return false;
            }

            const enviarParaTodos = data.includes('todos');
            const clientesSelecionados = data.filter((v: string) => v !== 'todos');

            await this.processarEnvioNotificacao(dica, clientesSelecionados, enviarParaTodos);
            return true;
          }
        }
      ]
    });

    await alert.present();
  }

  async processarEnvioNotificacao(dica: DicaLocal, clienteUuids: string[], enviarParaTodos: boolean) {
    this.loading = true;
    try {
      await this.notificacaoService.enviarNotificacao({
        dica_uuid: dica.uuid,
        cliente_uuids: clienteUuids,
        enviarParaTodos
      });
      this.mostrarToast('Notificação enviada com sucesso!', 'success');
    } catch (error: any) {
      this.mostrarToast(error.message || 'Erro ao enviar notificação', 'danger');
    } finally {
      this.loading = false;
    }
  }

  async mostrarToast(message: string, color: string = 'primary') {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'bottom'
    });
    await toast.present();
  }

  async doRefresh(event: any) {
    await this.carregarDicas();
    event.target.complete();
  }

}

