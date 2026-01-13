import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { AlertController, LoadingController, ToastController, ModalController } from '@ionic/angular';
import { MinistraLocal, MedicamentoLocal, SyncStatus } from '../models/local.models';
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
  private ministraService = inject(MinistraService);
  private medicamentoService = inject(MedicamentoService);
  private authService = inject(AuthService);
  private syncService = inject(SyncService);
  private alertCtrl = inject(AlertController);
  private loadingCtrl = inject(LoadingController);
  private toastCtrl = inject(ToastController);
  private modalCtrl = inject(ModalController);
  private interacaoService = inject(InteracaoService);


  // Expose enum to template
  public readonly SyncStatus = SyncStatus;

  public ministracoes: MinistraLocal[] = [];
  public medicamentosDisponiveis: MedicamentoLocal[] = [];
  public tipoUsuario: any | null = null; // TipoUsuario import needed if strict
  private clienteUuid: string | null = null;
  private subscriptions: Subscription[] = [];
  private isInitialized = false;

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
    const user = await this.authService.getCurrentUser();
    this.clienteUuid = user?.idusuario?.toString() || null;
    this.tipoUsuario = user?.tipo_usuario || null;

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
    this.tipoUsuario = null;
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
        cssClass: 'alert-interacao',
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
    let msg = 'Este medicamento interage com outros que você já toma:\n\n';
    interacoes.forEach((i, index) => {
      msg += `💊 ${i.medicamento1_nome}\n`;
      msg += `   +\n`;
      msg += `💊 ${i.medicamento2_nome}\n\n`;
      msg += `⚠️ Gravidade: ${i.gravidade}\n`;
      msg += `📝 ${i.descricao}\n`;
      if (index < interacoes.length - 1) {
        msg += '\n';
      }
    });
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
        frequencia: dados.frequencia ? parseInt(dados.frequencia) : null,
        status: Number(dados.status),
        medicamento_uuid: dados.medicamento_uuid // Include if medication can be changed
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
    return status == 1 ? 'Ativo' : 'Inativo';
  }

  getStatusCor(status: number): string {
    return status == 1 ? 'success' : 'medium';
  }

  isAtivo(status: number): boolean {
    return status == 1;
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

  // ==================== AÇÕES DO FARMACÊUTICO ====================

  async adicionarMedicamentoCatalogo() {
    const alert = await this.alertCtrl.create({
      header: 'Novo Medicamento',
      inputs: [
        {
          name: 'nome',
          type: 'text',
          placeholder: 'Nome do Medicamento'
        },
        {
          name: 'classe',
          type: 'text',
          placeholder: 'Classe (ex: Analgésico)'
        },
        {
          name: 'descricao',
          type: 'textarea',
          placeholder: 'Descrição breve'
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
            if (!data.nome) {
              this.mostrarToast('Nome é obrigatório', 'warning');
              return false;
            }
            await this.salvarMedicamentoCatalogo(data);
            return true;
          }
        }
      ]
    });
    await alert.present();
  }

  private async salvarMedicamentoCatalogo(data: any) {
    const loading = await this.loadingCtrl.create({ message: 'Salvando...' });
    await loading.present();
    try {
      await this.medicamentoService.criar({
        nome: data.nome,
        classe: data.classe || 'Geral',
        descricao: data.descricao,
        farmaceutico_uuid: this.clienteUuid || undefined
      });
      await this.mostrarToast('Medicamento criado com sucesso!', 'success');
    } catch (error: any) {
      await this.mostrarToast('Erro ao criar medicamento: ' + error.message, 'danger');
    } finally {
      await loading.dismiss();
    }
  }

  async editarMedicamentoCatalogo(medicamento: MedicamentoLocal) {
    const alert = await this.alertCtrl.create({
      header: 'Editar Medicamento',
      inputs: [
        {
          name: 'nome',
          type: 'text',
          value: medicamento.nome,
          placeholder: 'Nome'
        },
        {
          name: 'classe',
          type: 'text',
          value: medicamento.classe,
          placeholder: 'Classe'
        },
        {
          name: 'descricao',
          type: 'textarea',
          value: medicamento.descricao,
          placeholder: 'Descrição'
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
            if (!data.nome) {
              this.mostrarToast('Nome é obrigatório', 'warning');
              return false;
            }
            await this.atualizarMedicamentoCatalogo(medicamento.uuid, data);
            return true;
          }
        }
      ]
    });
    await alert.present();
  }

  private async atualizarMedicamentoCatalogo(uuid: string, data: any) {
    const loading = await this.loadingCtrl.create({ message: 'Atualizando...' });
    await loading.present();
    try {
      await this.medicamentoService.editar(uuid, {
        nome: data.nome,
        classe: data.classe,
        descricao: data.descricao
      });
      await this.mostrarToast('Medicamento atualizado!', 'success');
    } catch (error: any) {
      await this.mostrarToast('Erro ao atualizar: ' + error.message, 'danger');
    } finally {
      await loading.dismiss();
    }
  }

  async removerMedicamentoCatalogo(medicamento: MedicamentoLocal) {
    const alert = await this.alertCtrl.create({
      header: 'Excluir Medicamento',
      message: `Tem certeza que deseja excluir "${medicamento.nome}" do catálogo?`,
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Excluir',
          cssClass: 'alert-button-danger',
          handler: async () => {
            await this.deletarMedicamentoCatalogo(medicamento.uuid);
          }
        }
      ]
    });
    await alert.present();
  }

  private async deletarMedicamentoCatalogo(uuid: string) {
    const loading = await this.loadingCtrl.create({ message: 'Excluindo...' });
    await loading.present();
    try {
      await this.medicamentoService.deletar(uuid);
      await this.mostrarToast('Medicamento excluído!', 'success');
    } catch (error: any) {
      await this.mostrarToast('Erro ao excluir: ' + error.message, 'danger');
    } finally {
      await loading.dismiss();
    }
  }
}
