import { Component, OnInit, OnDestroy } from '@angular/core';
import { AlertController, LoadingController, ToastController, ModalController } from '@ionic/angular';
import { MinistraLocal, MedicamentoLocal } from '../models/local.models';
import { AuthService } from '../services/auth';
import { MinistraService } from '../services/ministra';
import { MedicamentoService } from '../services/medicamento';
import { SyncService } from '../services/sync';
import { MinistracaoPage } from '../ministracao/ministracao.page';
import { InteracaoService } from '../services/interacao';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-tab2',
  templateUrl: 'tab2.page.html',
  styleUrls: ['tab2.page.scss'],
  standalone: false,
})
export class Tab2Page implements OnInit, OnDestroy {

  public ministracoes: MinistraLocal[] = [];
  public medicamentosDisponiveis: MedicamentoLocal[] = [];
  private clienteUuid: string | null = null;
  private subscriptions: Subscription[] = [];
  private isInitialized = false;

  constructor(
    private ministraService: MinistraService,
    private medicamentoService: MedicamentoService,
    private authService: AuthService,
    private syncService: SyncService,
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private modalCtrl: ModalController,
    private interacaoService: InteracaoService
  ) { }

  async ngOnInit() {
    // Configura subscrições aos observables (apenas uma vez)
    this.setupSubscriptions();
  }

  /**
   * Configura as subscrições aos observables dos serviços
   * Os dados são atualizados automaticamente quando mudam
   */
  private setupSubscriptions(): void {
    // Subscreve ao estado de autenticação
    const authSub = this.authService.isAuthenticated$.subscribe(async isAuthenticated => {
      if (isAuthenticated && !this.isInitialized) {
        await this.inicializarDados();
      } else if (!isAuthenticated) {
        this.limparDados();
      }
    });
    this.subscriptions.push(authSub);

    // Subscreve às ministrações (atualização automática)
    const ministraSub = this.ministraService.ministra$.subscribe(
      ministracoes => {
        this.ministracoes = ministracoes;
      }
    );
    this.subscriptions.push(ministraSub);

    // Subscreve aos medicamentos (atualização automática)
    const medicamentosSub = this.medicamentoService.medicamentos$.subscribe(
      medicamentos => {
        this.medicamentosDisponiveis = medicamentos;
      }
    );
    this.subscriptions.push(medicamentosSub);
  }

  /**
   * Inicializa dados do usuário (apenas uma vez)
   */
  private async inicializarDados(): Promise<void> {
    this.clienteUuid = await this.authService.getCurrentUserUuid();

    if (!this.clienteUuid) {
      console.error('[Tab2Page] UUID do usuário não disponível');
      await this.mostrarToast('Erro ao carregar sessão. Tente fazer login novamente.', 'warning');
      return;
    }

    this.isInitialized = true;
    // Não precisa chamar carregarDados() - os observables já trazem os dados
  }

  /**
   * Limpa dados ao deslogar
   */
  private limparDados(): void {
    this.ministracoes = [];
    this.medicamentosDisponiveis = [];
    this.clienteUuid = null;
    this.isInitialized = false;
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  /**
   * Força sincronização manual (Pull-to-refresh ou botão)
   */
  async syncManual(event?: any) {
    try {
      await this.syncService.forceSyncNow();
      if (!event) {
        await this.mostrarToast('Dados sincronizados! ✅', 'success');
      }
    } catch (error) {
      console.error('Erro ao sincronizar:', error);
      if (!event) {
        await this.mostrarToast('Erro ao sincronizar dados', 'danger');
      }
    } finally {
      // Completa o pull-to-refresh se houver
      if (event) {
        event.target.complete();
      }
    }
  }

  async adicionarMedicamento() {
    if (this.medicamentosDisponiveis.length === 0) {
      await this.mostrarToast(
        'Nenhum medicamento disponível. Peça ao farmacêutico para cadastrar.',
        'warning'
      );
      return;
    }

    if (!this.clienteUuid) {
      await this.mostrarToast('Erro: Sessão não inicializada', 'danger');
      return;
    }

    const modal = await this.modalCtrl.create({
      component: MinistracaoPage,
      componentProps: {
        clienteUuid: this.clienteUuid
      },
      breakpoints: [0, 0.5, 0.75, 0.95],
      initialBreakpoint: 0.95,
      cssClass: 'modal-fullscreen'
    });

    await modal.present();

    const { data, role } = await modal.onWillDismiss();

    if (role === 'confirm' && data) {
      await this.verificarESalvar(data);
    }
  }

  private async verificarESalvar(data: any) {
    const novoMedUuid = data.medicamento_uuid;
    // Pega UUIDs dos medicamentos que o usuário já toma (excluindo duplicatas se houver)
    const meusMedsUuids = [...new Set(this.ministracoes.map(m => m.medicamento_uuid))];

    const interacoes = await this.interacaoService.verificarInteracoes(novoMedUuid, meusMedsUuids);

    if (interacoes.length > 0) {
      const alert = await this.alertCtrl.create({
        header: '⚠️ Interação Medicamentosa',
        message: this.formatarMensagemInteracao(interacoes),
        cssClass: 'modal-dinda', // Reusing modal style for better look or custom alert class
        buttons: [
          {
            text: 'Cancelar',
            role: 'cancel',
            cssClass: 'alert-button-cancel'
          },
          {
            text: 'Adicionar Mesmo Assim',
            cssClass: 'alert-button-danger',
            handler: async () => {
              await this.salvarMinistracao(data);
            }
          }
        ]
      });
      await alert.present();
    } else {
      await this.salvarMinistracao(data);
    }
  }

  private formatarMensagemInteracao(interacoes: any[]): string {
    let msg = '<div style="text-align: left; max-height: 300px; overflow-y: auto;">';
    msg += '<p>Este medicamento interage com outros que você já toma:</p>';
    interacoes.forEach(i => {
      msg += `<div style="margin-bottom: 12px; padding: 8px; background: #fff0f0; border-radius: 8px;">`;
      msg += `<strong>${i.medicamento1_nome} + ${i.medicamento2_nome}</strong><br>`;
      msg += `<span style="color: #d32f2f; font-weight: bold;">Gravidade: ${i.gravidade}</span><br>`;
      msg += `<span style="font-size: 14px;">${i.descricao}</span>`;
      msg += `</div>`;
    });
    msg += '</div>';
    return msg;
  }

  private async salvarMinistracao(dados: any) {
    const loading = await this.loadingCtrl.create({
      message: 'Salvando...'
    });
    await loading.present();

    try {
      if (!this.clienteUuid) {
        throw new Error('Cliente UUID não encontrado');
      }

      await this.ministraService.criar(
        {
          medicamento_uuid: dados.medicamento_uuid,
          horario: dados.horario || null,
          dosagem: dados.dosagem || null,
          frequencia: dados.frequencia ? parseInt(dados.frequencia) : undefined,
          status: 1
        },
        this.clienteUuid
      );

      await this.mostrarToast('Remédio adicionado com sucesso! ✅', 'success');

    } catch (error: any) {
      console.error('Erro ao adicionar:', error);
      await this.mostrarToast(
        error.message || 'Erro ao adicionar remédio',
        'danger'
      );
    } finally {
      await loading.dismiss();
    }
  }

  async editarMinistracao(ministracao: MinistraLocal) {
    if (!this.clienteUuid) {
      await this.mostrarToast('Erro: Sessão não inicializada', 'danger');
      return;
    }

    const modal = await this.modalCtrl.create({
      component: MinistracaoPage,
      componentProps: {
        ministracao: ministracao,
        clienteUuid: this.clienteUuid
      },
      breakpoints: [0, 0.5, 0.75, 0.95],
      initialBreakpoint: 0.95,
      cssClass: 'modal-fullscreen'
    });

    await modal.present();

    const { data, role } = await modal.onWillDismiss();

    if (role === 'confirm' && data) {
      await this.atualizarMinistracao(ministracao.uuid, data);
    }
  }

  private async atualizarMinistracao(uuid: string, dados: any) {
    const loading = await this.loadingCtrl.create({
      message: 'Atualizando...'
    });
    await loading.present();

    try {
      await this.ministraService.editar(uuid, {
        horario: dados.horario || null,
        dosagem: dados.dosagem || null,
        frequencia: dados.frequencia ? parseInt(dados.frequencia) : undefined,
        status: parseInt(dados.status)
      });

      await this.mostrarToast('Remédio atualizado com sucesso! ✅', 'success');

    } catch (error: any) {
      console.error('Erro ao atualizar:', error);
      await this.mostrarToast(
        error.message || 'Erro ao atualizar remédio',
        'danger'
      );
    } finally {
      await loading.dismiss();
    }
  }

  async removerMinistracao(ministracao: MinistraLocal) {
    const alert = await this.alertCtrl.create({
      header: 'Confirmar Remoção',
      message: `Tem certeza que deseja remover "${ministracao.medicamento_nome || 'este remédio'}" da sua lista?`,
      cssClass: 'modal-dinda',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
          cssClass: 'alert-button-cancel'
        },
        {
          text: 'Remover',
          cssClass: 'alert-button-danger',
          handler: async () => {
            await this.confirmarRemocao(ministracao.uuid);
          }
        }
      ]
    });

    await alert.present();
  }

  private async confirmarRemocao(uuid: string) {
    const loading = await this.loadingCtrl.create({
      message: 'Removendo...'
    });
    await loading.present();

    try {
      await this.ministraService.deletar(uuid);
      await this.mostrarToast('Remédio removido com sucesso! 🗑️', 'success');

    } catch (error: any) {
      console.error('Erro ao remover:', error);
      await this.mostrarToast(
        error.message || 'Erro ao remover remédio',
        'danger'
      );
    } finally {
      await loading.dismiss();
    }
  }

  formatarHorario(horario: string | null): string {
    if (!horario) return 'Não definido';
    return horario;
  }

  getStatusTexto(status: number): string {
    return status === 1 ? 'Ativo' : 'Inativo';
  }

  getStatusCor(status: number): string {
    return status === 1 ? 'success' : 'medium';
  }

  private async mostrarToast(
    mensagem: string,
    cor: 'success' | 'danger' | 'warning'
  ) {
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
