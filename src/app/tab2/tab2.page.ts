import { Component, OnInit, OnDestroy } from '@angular/core';
import { AlertController, LoadingController, ToastController } from '@ionic/angular';
import { MinistraLocal, MedicamentoLocal } from '../models/local.models';
import { AuthService } from '../services/auth';
import { MinistraService } from '../services/ministra';
import { MedicamentoService } from '../services/medicamento';
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

  constructor(
    private ministraService: MinistraService,
    private medicamentoService: MedicamentoService,
    private authService: AuthService,
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {}

  async ngOnInit() {
    const authSub = this.authService.isAuthenticated$.subscribe(async isAuthenticated => {
      if (isAuthenticated) {
        // Aguarda o UUID estar disponível
        this.clienteUuid = await this.authService.getCurrentUserUuid();

        // Retry caso o UUID não esteja disponível imediatamente
        let retries = 0;
        while (!this.clienteUuid && retries < 5) {
          await this.delay(200); // Aguarda 200ms
          this.clienteUuid = await this.authService.getCurrentUserUuid();
          retries++;
        }

        if (!this.clienteUuid) {
          console.error('[Tab2Page] UUID do usuário não disponível após retries');
          await this.mostrarToast('Erro: Sessão não inicializada. Tente fazer login novamente.', 'warning');
          return;
        }

        console.log('[Tab2Page] Cliente UUID obtido:', this.clienteUuid);

        // Configura as subscrições apenas uma vez
        if (this.subscriptions.length <= 1) {
          const ministraSub = this.ministraService.ministra$.subscribe(
            ministracoes => {
              console.log('[Tab2Page] Ministrações recebidas:', ministracoes.length);
              this.ministracoes = ministracoes;
            }
          );
          this.subscriptions.push(ministraSub);

          const medicamentosSub = this.medicamentoService.medicamentos$.subscribe(
            medicamentos => {
              console.log('[Tab2Page] Medicamentos recebidos:', medicamentos.length);
              this.medicamentosDisponiveis = medicamentos;
            }
          );
          this.subscriptions.push(medicamentosSub);
        }

        // Aguarda um pouco para a sincronização completar
        await this.delay(500);
        await this.carregarDados();

      } else {
        this.ministracoes = [];
        this.medicamentosDisponiveis = [];
        this.clienteUuid = null;
      }
    });
    this.subscriptions.push(authSub);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  async ionViewWillEnter() {
    if (this.clienteUuid) {
      await this.carregarDados();
    }
  }

  public async carregarDados() {
    const loading = await this.loadingCtrl.create({
      message: 'Carregando seus remédios...'
    });
    await loading.present();

    try {
      await this.ministraService.recarregar();
      await this.medicamentoService.recarregar();
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      await this.mostrarToast('Erro ao carregar dados', 'danger');
    } finally {
      await loading.dismiss();
    }
  }

  async adicionarMedicamento() {
    // DEBUG: Log para ver o estado dos medicamentos no momento do clique
    console.log('[Tab2Page] Tentando adicionar. Medicamentos disponíveis no momento:', this.medicamentosDisponiveis);

    if (this.medicamentosDisponiveis.length === 0) {
      await this.mostrarToast(
        'Nenhum medicamento disponível. Peça ao farmacêutico para cadastrar.',
        'warning'
      );
      return;
    }

    const inputs: any[] = [
      {
        name: 'medicamento_uuid',
        type: 'radio',
        label: 'Selecione o medicamento',
        value: null
      }
    ];

    this.medicamentosDisponiveis.forEach(med => {
      inputs.push({
        name: 'medicamento_uuid',
        type: 'radio',
        label: `${med.nome} - ${med.classe}`,
        value: med.uuid
      });
    });

    inputs.push(
      {
        name: 'horario',
        type: 'time',
        placeholder: 'Horário (ex: 08:00)'
      },
      {
        name: 'dosagem',
        type: 'text',
        placeholder: 'Dosagem (ex: 1 comprimido)'
      },
      {
        name: 'frequencia',
        type: 'number',
        placeholder: 'Frequência (vezes por dia)',
        min: 1,
        max: 10
      }
    );

    const alert = await this.alertCtrl.create({
      header: '➕ Adicionar Remédio',
      cssClass: 'modal-dinda',
      inputs: inputs,
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
          cssClass: 'alert-button-cancel'
        },
        {
          text: 'Adicionar',
          cssClass: 'alert-button-confirm',
          handler: async (data) => {
            if (!data.medicamento_uuid) {
              await this.mostrarToast('Selecione um medicamento', 'warning');
              return false;
            }
            await this.salvarMinistracao(data);
            return true;
          }
        }
      ]
    });

    await alert.present();
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
    const alert = await this.alertCtrl.create({
      header: `✏️ Editar ${ministracao.medicamento_nome || 'Remédio'}`,
      cssClass: 'modal-dinda',
      inputs: [
        {
          name: 'horario',
          type: 'time',
          value: ministracao.horario || '',
          placeholder: 'Horário'
        },
        {
          name: 'dosagem',
          type: 'text',
          value: ministracao.dosagem || '',
          placeholder: 'Dosagem'
        },
        {
          name: 'frequencia',
          type: 'number',
          value: ministracao.frequencia || '',
          placeholder: 'Frequência (vezes por dia)',
          min: 1,
          max: 10
        },
        {
          name: 'status',
          type: 'radio',
          label: 'Ativo',
          value: 1,
          checked: ministracao.status === 1
        },
        {
          name: 'status',
          type: 'radio',
          label: 'Inativo',
          value: 0,
          checked: ministracao.status === 0
        }
      ],
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
          cssClass: 'alert-button-cancel'
        },
        {
          text: 'Salvar',
          cssClass: 'alert-button-confirm',
          handler: async (data) => {
            await this.atualizarMinistracao(ministracao.uuid, data);
            return true;
          }
        }
      ]
    });

    await alert.present();
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
