import { Component, OnInit, OnDestroy } from '@angular/core';
import { AlertController, LoadingController, ToastController } from '@ionic/angular';
import { InteracaoLocal, MedicamentoLocal } from '../models/local.models';
import { InteracaoService } from '../services/interacao';
import { MedicamentoService } from '../services/medicamento';
import { AuthService } from '../services/auth';
import { SyncService } from '../services/sync';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-tab5',
  templateUrl: './tab5.page.html',
  styleUrls: ['./tab5.page.scss'],
  standalone: false,
})
export class Tab5Page implements OnInit, OnDestroy {

  interacoes: InteracaoLocal[] = [];
  medicamentos: MedicamentoLocal[] = [];
  medicamentosFiltrados1: MedicamentoLocal[] = [];
  medicamentosFiltrados2: MedicamentoLocal[] = [];

  // Controle de pesquisa
  searchTerm1 = '';
  searchTerm2 = '';
  medicamentoSelecionado1: MedicamentoLocal | null = null;
  medicamentoSelecionado2: MedicamentoLocal | null = null;

  // Formulário
  descricao = '';
  gravidade: 'BAIXA' | 'MEDIA' | 'ALTA' = 'MEDIA';
  mostrarFormulario = false;

  private subscriptions: Subscription[] = [];
  private farmaceuticoUuid: string | null = null;

  constructor(
    private interacaoService: InteracaoService,
    private medicamentoService: MedicamentoService,
    private authService: AuthService,
    private syncService: SyncService,
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) { }

  async ngOnInit() {
    // Subscreve às interações
    const interacaoSub = this.interacaoService.interacao$.subscribe(
      interacoes => {
        this.interacoes = interacoes;
      }
    );
    this.subscriptions.push(interacaoSub);

    // Subscreve aos medicamentos
    const medicamentoSub = this.medicamentoService.medicamentos$.subscribe(
      medicamentos => {
        this.medicamentos = medicamentos;
      }
    );
    this.subscriptions.push(medicamentoSub);

    // Pega informações do usuário
    const user = await this.authService.getCurrentUser();
    this.farmaceuticoUuid = user?.idusuario?.toString() || null;

    if (user?.tipo_usuario !== 'FARMACEUTICO') {
      await this.mostrarToast('Acesso negado: apenas farmacêuticos', 'danger');
    }
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  /**
   * Sincronização manual
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
      if (event) {
        event.target.complete();
      }
    }
  }

  /**
   * Abre/fecha formulário de nova interação
   */
  toggleFormulario() {
    this.mostrarFormulario = !this.mostrarFormulario;
    if (!this.mostrarFormulario) {
      this.limparFormulario();
    }
  }

  /**
   * Filtra medicamentos 1 em tempo real
   */
  filtrarMedicamentos1(): void {
    if (this.medicamentoSelecionado1 && this.searchTerm1 === this.medicamentoSelecionado1.nome) {
      this.medicamentosFiltrados1 = [];
      return;
    }

    if (!this.searchTerm1 || this.searchTerm1.trim() === '') {
      this.medicamentosFiltrados1 = [];
      this.medicamentoSelecionado1 = null;
      return;
    }

    const termo = this.searchTerm1.toLowerCase().trim();
    this.medicamentosFiltrados1 = this.medicamentos
      .filter(med => med.nome.toLowerCase().includes(termo))
      .slice(0, 10);

    this.medicamentoSelecionado1 = null;
  }

  /**
   * Filtra medicamentos 2 em tempo real
   */
  filtrarMedicamentos2(): void {
    if (this.medicamentoSelecionado2 && this.searchTerm2 === this.medicamentoSelecionado2.nome) {
      this.medicamentosFiltrados2 = [];
      return;
    }

    if (!this.searchTerm2 || this.searchTerm2.trim() === '') {
      this.medicamentosFiltrados2 = [];
      this.medicamentoSelecionado2 = null;
      return;
    }

    const termo = this.searchTerm2.toLowerCase().trim();
    this.medicamentosFiltrados2 = this.medicamentos
      .filter(med => med.nome.toLowerCase().includes(termo))
      .slice(0, 10);

    this.medicamentoSelecionado2 = null;
  }

  /**
   * Seleciona medicamento 1
   */
  selecionarMedicamento1(medicamento: MedicamentoLocal): void {
    this.medicamentoSelecionado1 = medicamento;
    this.searchTerm1 = medicamento.nome;
    this.medicamentosFiltrados1 = [];
  }

  /**
   * Seleciona medicamento 2
   */
  selecionarMedicamento2(medicamento: MedicamentoLocal): void {
    this.medicamentoSelecionado2 = medicamento;
    this.searchTerm2 = medicamento.nome;
    this.medicamentosFiltrados2 = [];
  }

  /**
   * Limpa seleção de medicamento 1
   */
  limparMedicamento1(): void {
    this.medicamentoSelecionado1 = null;
    this.searchTerm1 = '';
    this.medicamentosFiltrados1 = [];
  }

  /**
   * Limpa seleção de medicamento 2
   */
  limparMedicamento2(): void {
    this.medicamentoSelecionado2 = null;
    this.searchTerm2 = '';
    this.medicamentosFiltrados2 = [];
  }

  /**
   * Limpa todo o formulário
   */
  limparFormulario(): void {
    this.limparMedicamento1();
    this.limparMedicamento2();
    this.descricao = '';
    this.gravidade = 'MEDIA';
  }

  /**
   * Valida se pode salvar
   */
  podeSalvar(): boolean {
    return !!(
      this.medicamentoSelecionado1 &&
      this.medicamentoSelecionado2 &&
      this.medicamentoSelecionado1.uuid !== this.medicamentoSelecionado2.uuid &&
      this.descricao.trim()
    );
  }

  /**
   * Salva nova interação
   */
  async salvarInteracao() {
    if (!this.podeSalvar()) {
      await this.mostrarToast('Preencha todos os campos corretamente', 'warning');
      return;
    }

    const loading = await this.loadingCtrl.create({
      message: 'Salvando interação...'
    });
    await loading.present();

    try {
      await this.interacaoService.criar({
        medicamento1_uuid: this.medicamentoSelecionado1!.uuid,
        medicamento2_uuid: this.medicamentoSelecionado2!.uuid,
        descricao: this.descricao.trim(),
        gravidade: this.gravidade
      });

      await this.mostrarToast('Interação cadastrada com sucesso! ✅', 'success');
      this.limparFormulario();
      this.mostrarFormulario = false;

    } catch (error: any) {
      console.error('Erro ao salvar interação:', error);
      await this.mostrarToast(
        error.message || 'Erro ao salvar interação',
        'danger'
      );
    } finally {
      await loading.dismiss();
    }
  }

  /**
   * Edita uma interação existente
   */
  async editarInteracao(interacao: InteracaoLocal) {
    const alert = await this.alertCtrl.create({
      header: 'Editar Interação',
      inputs: [
        {
          name: 'descricao',
          type: 'textarea',
          value: interacao.descricao,
          placeholder: 'Descrição da interação'
        },
        {
          name: 'gravidade',
          type: 'text',
          value: interacao.gravidade,
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
            if (!data.descricao || !data.gravidade) {
              await this.mostrarToast('Preencha todos os campos', 'warning');
              return false;
            }
            await this.atualizarInteracao(interacao.uuid, data);
            return true;
          }
        }
      ]
    });
    await alert.present();
  }

  private async atualizarInteracao(uuid: string, dados: any) {
    const loading = await this.loadingCtrl.create({ message: 'Atualizando...' });
    await loading.present();

    try {
      await this.interacaoService.editar(uuid, {
        descricao: dados.descricao.trim(),
        gravidade: dados.gravidade.toUpperCase()
      });
      await this.mostrarToast('Interação atualizada! ✅', 'success');
    } catch (error: any) {
      await this.mostrarToast('Erro ao atualizar: ' + error.message, 'danger');
    } finally {
      await loading.dismiss();
    }
  }

  /**
   * Remove uma interação
   */
  async removerInteracao(interacao: InteracaoLocal) {
    const alert = await this.alertCtrl.create({
      header: 'Confirmar Exclusão',
      message: `Tem certeza que deseja excluir a interação entre "${interacao.medicamento1_nome}" e "${interacao.medicamento2_nome}"?`,
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Excluir',
          cssClass: 'alert-button-danger',
          handler: async () => {
            await this.confirmarRemocao(interacao.uuid);
          }
        }
      ]
    });
    await alert.present();
  }

  private async confirmarRemocao(uuid: string) {
    const loading = await this.loadingCtrl.create({ message: 'Excluindo...' });
    await loading.present();

    try {
      await this.interacaoService.deletar(uuid);
      await this.mostrarToast('Interação excluída! 🗑️', 'success');
    } catch (error: any) {
      await this.mostrarToast('Erro ao excluir: ' + error.message, 'danger');
    } finally {
      await loading.dismiss();
    }
  }

  /**
   * Retorna cor do badge de gravidade
   */
  getGravidadeCor(gravidade: string): string {
    switch (gravidade) {
      case 'BAIXA': return 'success';
      case 'MEDIA': return 'warning';
      case 'ALTA': return 'danger';
      default: return 'medium';
    }
  }

  /**
   * Mostra toast
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

