import { Component, OnInit } from '@angular/core';
import { FaqService } from '../services/faq';
import { FaqLocal } from '../models/local.models';
import { AuthService } from '../services/auth';
import { AlertController, ToastController, LoadingController } from '@ionic/angular';
import { TipoUsuario } from '../models/auth.model';

@Component({
  selector: 'app-tab3',
  templateUrl: 'tab3.page.html',
  styleUrls: ['tab3.page.scss'],
  standalone: false,
})
export class Tab3Page implements OnInit {

  faqs: FaqLocal[] = [];
  tipoUsuario: TipoUsuario | null = null;

  constructor(
    private faqService: FaqService,
    private authService: AuthService,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController
  ) { }

  async ngOnInit() {
    this.carregarUsuario();
    this.faqService.faq$.subscribe(faqs => {
      this.faqs = faqs;
    });
  }

  async ionViewWillEnter() {
    await this.carregarUsuario();
  }

  async carregarUsuario() {
    const user = await this.authService.getCurrentUser();
    this.tipoUsuario = user?.tipo_usuario || null;
  }

  // ==================== AÇÕES DO FARMACÊUTICO ====================

  async adicionarFaq() {
    const alert = await this.alertCtrl.create({
      header: 'Nova Pergunta',
      inputs: [
        {
          name: 'pergunta',
          type: 'text',
          placeholder: 'Pergunta'
        },
        {
          name: 'resposta',
          type: 'textarea',
          placeholder: 'Resposta'
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
            if (!data.pergunta || !data.resposta) {
              this.mostrarToast('Preencha todos os campos', 'warning');
              return false;
            }
            await this.salvarFaq(data);
            return true;
          }
        }
      ]
    });
    await alert.present();
  }

  private async salvarFaq(data: any) {
    const loading = await this.loadingCtrl.create({ message: 'Salvando...' });
    await loading.present();
    try {
      await this.faqService.criar({
        pergunta: data.pergunta,
        resposta: data.resposta
      });
      await this.mostrarToast('FAQ criada com sucesso!', 'success');
    } catch (error: any) {
      await this.mostrarToast('Erro ao criar FAQ: ' + error.message, 'danger');
    } finally {
      await loading.dismiss();
    }
  }

  async editarFaq(faq: FaqLocal) {
    const alert = await this.alertCtrl.create({
      header: 'Editar FAQ',
      inputs: [
        {
          name: 'pergunta',
          type: 'text',
          value: faq.pergunta,
          placeholder: 'Pergunta'
        },
        {
          name: 'resposta',
          type: 'textarea',
          value: faq.resposta,
          placeholder: 'Resposta'
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
            if (!data.pergunta || !data.resposta) {
              this.mostrarToast('Preencha todos os campos', 'warning');
              return false;
            }
            await this.atualizarFaq(faq.uuid, data);
            return true;
          }
        }
      ]
    });
    await alert.present();
  }

  private async atualizarFaq(uuid: string, data: any) {
    const loading = await this.loadingCtrl.create({ message: 'Atualizando...' });
    await loading.present();
    try {
      await this.faqService.editar(uuid, {
        pergunta: data.pergunta,
        resposta: data.resposta
      });
      await this.mostrarToast('FAQ atualizada!', 'success');
    } catch (error: any) {
      await this.mostrarToast('Erro ao atualizar: ' + error.message, 'danger');
    } finally {
      await loading.dismiss();
    }
  }

  async removerFaq(faq: FaqLocal) {
    const alert = await this.alertCtrl.create({
      header: 'Excluir FAQ',
      message: `Tem certeza que deseja excluir esta pergunta?`,
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Excluir',
          cssClass: 'alert-button-danger',
          handler: async () => {
            await this.deletarFaq(faq.uuid);
          }
        }
      ]
    });
    await alert.present();
  }

  private async deletarFaq(uuid: string) {
    const loading = await this.loadingCtrl.create({ message: 'Excluindo...' });
    await loading.present();
    try {
      await this.faqService.deletar(uuid);
      await this.mostrarToast('FAQ excluída!', 'success');
    } catch (error: any) {
      await this.mostrarToast('Erro ao excluir: ' + error.message, 'danger');
    } finally {
      await loading.dismiss();
    }
  }

  private async mostrarToast(mensagem: string, cor: 'success' | 'danger' | 'warning') {
    const toast = await this.toastCtrl.create({
      message: mensagem,
      duration: 3000,
      position: 'top',
      color: cor,
      cssClass: 'toast-dinda'
    });
    await toast.present();
  }

}
