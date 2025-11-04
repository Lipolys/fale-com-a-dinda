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
    // Obtém o UUID do cliente logado
    this.clienteUuid = await this.authService.getCurrentUserUuid();

    if (!this.clienteUuid) {
      await this.mostrarToast('Erro: Usuário não identificado', 'danger');
      return;
    }

    // Inscreve-se nos observables para atualização automática
    const ministraSub = this.ministraService.ministra$.subscribe(
      ministracoes => {
        this.ministracoes = ministracoes;
      }
    );
    this.subscriptions.push(ministraSub);

    const medicamentosSub = this.medicamentoService.medicamentos$.subscribe(
      medicamentos => {
        this.medicamentosDisponiveis = medicamentos;
      }
    );
    this.subscriptions.push(medicamentosSub);

    // Carrega os dados iniciais
    await this.carregarDados();
  }

  ngOnDestroy() {
    // Cancela todas as inscrições
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  /**
   * Recarrega quando a página entra em foco
   */
  async ionViewWillEnter() {
    await this.carregarDados();
  }

  /**
   * Carrega ministracões e medicamentos disponíveis
   */
  public async carregarDados() {
    const loading = await this.loadingCtrl.create({
      message: 'Carregando seus remédios...'
    });
    await loading.present();

    try {
      // Carrega ministracões do cliente
      await this.ministraService.recarregar();

      // Carrega medicamentos disponíveis (para adicionar novos)
      await this.medicamentoService.recarregar();

    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      await this.mostrarToast('Erro ao carregar dados', 'danger');
    } finally {
      await loading.dismiss();
    }
  }

  /**
   * Abre modal para adicionar novo medicamento
   */
  async adicionarMedicamento() {
    if (this.medicamentosDisponiveis.length === 0) {
      await this.mostrarToast(
        'Nenhum medicamento disponível. Peça ao farmacêutico para cadastrar.',
        'warning'
      );
      return;
    }

    // Cria inputs para o formulário
    const inputs: any[] = [
      {
        name: 'medicamento_uuid',
        type: 'radio',
        label: 'Selecione o medicamento',
        value: null
      }
    ];

    // Adiciona cada medicamento como opção
    this.medicamentosDisponiveis.forEach(med => {
      inputs.push({
        name: 'medicamento_uuid',
        type: 'radio',
        label: `${med.nome} - ${med.classe}`,
        value: med.uuid
      });
    });

    // Adiciona campos adicionais
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

  /**
   * Salva nova ministração
   */
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
          status: 1 // Ativo por padrão
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

  /**
   * Edita uma ministração existente
   */
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

  /**
   * Atualiza ministração no serviço
   */
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

  /**
   * Remove uma ministração após confirmação
   */
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

  /**
   * Confirma e executa a remoção
   */
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

  /**
   * Formata horário para exibição
   */
  formatarHorario(horario: string | null): string {
    if (!horario) return 'Não definido';
    return horario;
  }

  /**
   * Formata status para exibição
   */
  getStatusTexto(status: number): string {
    return status === 1 ? 'Ativo' : 'Inativo';
  }

  /**
   * Retorna cor do status
   */
  getStatusCor(status: number): string {
    return status === 1 ? 'success' : 'medium';
  }

  /**
   * Mostra toast de feedback
   */
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
