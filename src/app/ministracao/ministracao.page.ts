import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { ModalController, LoadingController, ToastController } from '@ionic/angular';
import { MedicamentoLocal, MinistraLocal } from '../models/local.models';
import { MedicamentoService } from '../services/medicamento';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-ministracao',
  templateUrl: './ministracao.page.html',
  styleUrls: ['./ministracao.page.scss'],
  standalone: false,
})
export class MinistracaoPage implements OnInit, OnDestroy {

  @Input() ministracao?: MinistraLocal;
  @Input() clienteUuid!: string;

  // Controles
  isEdit = false;
  currentStep = 1; // Para futura implementação de stepper

  // Busca de medicamentos
  searchTerm = '';
  medicamentosDisponiveis: MedicamentoLocal[] = [];
  medicamentosFiltrados: MedicamentoLocal[] = [];
  medicamentoSelecionado: MedicamentoLocal | null = null;

  // Dados do formulário
  horario = '';
  dosagem = '';
  frequencia: number | null = null;
  status = 1;

  private subscription?: Subscription;

  constructor(
    private modalCtrl: ModalController,
    private medicamentoService: MedicamentoService,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) { }

  ngOnInit() {
    // Verifica se é edição
    if (this.ministracao) {
      this.isEdit = true;
      this.carregarDadosEdicao();
    }

    // Subscreve aos medicamentos disponíveis
    this.subscription = this.medicamentoService.medicamentos$.subscribe(
      medicamentos => {
        this.medicamentosDisponiveis = medicamentos;
        this.filtrarMedicamentos();
      }
    );
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
  }

  /**
   * Carrega dados para edição
   */
  private carregarDadosEdicao(): void {
    if (!this.ministracao) return;

    this.horario = this.ministracao.horario || '';
    this.dosagem = this.ministracao.dosagem || '';
    this.frequencia = this.ministracao.frequencia || null;
    this.status = this.ministracao.status;

    // Busca o medicamento selecionado
    const med = this.medicamentosDisponiveis.find(
      m => m.uuid === this.ministracao!.medicamento_uuid
    );
    if (med) {
      this.medicamentoSelecionado = med;
      this.searchTerm = med.nome;
    }
  }

  /**
   * Filtra medicamentos em tempo real
   */
  filtrarMedicamentos(): void {
    if (!this.searchTerm || this.searchTerm.trim() === '') {
      this.medicamentosFiltrados = [];
      return;
    }

    const termo = this.searchTerm.toLowerCase().trim();
    this.medicamentosFiltrados = this.medicamentosDisponiveis
      .filter(med => med.nome.toLowerCase().includes(termo))
      .slice(0, 5); // Limita a 5 resultados
  }

  /**
   * Seleciona um medicamento da lista
   */
  selecionarMedicamento(medicamento: MedicamentoLocal): void {
    this.medicamentoSelecionado = medicamento;
    this.searchTerm = medicamento.nome;
    this.medicamentosFiltrados = [];
  }

  /**
   * Limpa a seleção
   */
  limparSelecao(): void {
    this.medicamentoSelecionado = null;
    this.searchTerm = '';
    this.medicamentosFiltrados = [];
  }

  /**
   * Valida o formulário
   */
  validarFormulario(): { valido: boolean; erro?: string } {
    if (!this.medicamentoSelecionado) {
      return { valido: false, erro: 'Selecione um medicamento' };
    }

    // Validações opcionais
    if (this.frequencia && (this.frequencia < 1 || this.frequencia > 10)) {
      return { valido: false, erro: 'Frequência deve ser entre 1 e 10' };
    }

    return { valido: true };
  }

  /**
   * Salva os dados
   */
  async salvar() {
    const validacao = this.validarFormulario();

    if (!validacao.valido) {
      await this.mostrarToast(validacao.erro!, 'warning');
      return;
    }

    // Retorna os dados para a página que chamou
    this.modalCtrl.dismiss({
      medicamento_uuid: this.medicamentoSelecionado!.uuid,
      horario: this.horario || null,
      dosagem: this.dosagem || null,
      frequencia: this.frequencia || null,
      status: this.status
    }, 'confirm');
  }

  /**
   * Fecha o modal
   */
  fechar() {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  /**
   * Mostra toast de feedback
   */
  private async mostrarToast(mensagem: string, cor: 'success' | 'danger' | 'warning') {
    const toast = await this.toastCtrl.create({
      message: mensagem,
      duration: 2000,
      position: 'top',
      color: cor
    });
    await toast.present();
  }
}
