import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { AlertController, ToastController, NavController } from '@ionic/angular';
import { MinistraService } from '../services/ministra';
import { MinistraLocal, InteracaoLocal } from '../models/local.models';
import { Subscription } from 'rxjs';
import { AuthService } from '../services/auth';
import { TipoUsuario } from '../models/auth.model';
import { InteracaoService } from '../services/interacao';

interface MedicamentoView {
  ministracao: MinistraLocal;
  horario: string;
  status: 'tomado' | 'proximo' | 'pendente' | 'atrasado';
  cor: string;
  icone: string;
  tempoRestante?: string;
}

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  standalone: false,
})
export class Tab1Page implements OnInit, OnDestroy {
  private alertController = inject(AlertController);
  private toastController = inject(ToastController);
  private ministraService = inject(MinistraService);
  private navCtrl = inject(NavController);
  private authService = inject(AuthService);
  private interacaoService = inject(InteracaoService);


  medicamentosHoje: MedicamentoView[] = [];
  tipoUsuario: TipoUsuario | null = null;
  interacoesUsuario: InteracaoLocal[] = [];
  private subscription?: Subscription;

  async ngOnInit() {
    await this.carregarUsuario();

    if (this.tipoUsuario === 'CLIENTE') {
      this.subscription = this.ministraService.ministra$.subscribe(ministracoes => {
        this.atualizarListaHoje(ministracoes);
      });
    }
  }

  async ionViewWillEnter() {
    await this.carregarUsuario();
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
  }

  async carregarUsuario() {
    const user = await this.authService.getCurrentUser();
    this.tipoUsuario = user?.tipo_usuario || null;
  }

  atualizarListaHoje(ministracoes: MinistraLocal[]) {
    const hoje = new Date().toISOString().split('T')[0];

    // Filtra apenas ativos (status 1)
    const ativos = ministracoes.filter(m => m.status == 1);

    this.medicamentosHoje = ativos.map(m => {
      let status: 'tomado' | 'proximo' | 'pendente' | 'atrasado' = 'pendente';
      let cor = 'medium';
      let icone = 'ellipse-outline';

      // Verifica se foi tomado hoje (baseado na data de ultimaTomada)
      // ultimaTomada é ISO string completa
      const tomouHoje = m.ultimaTomada && m.ultimaTomada.startsWith(hoje);

      if (tomouHoje) {
        status = 'tomado';
        cor = 'success';
        icone = 'checkmark-circle';
      } else {
        // Verifica horário
        if (m.horario) {
          const agora = new Date();
          const [hora, min] = m.horario.split(':').map(Number);
          const dataHorario = new Date();
          dataHorario.setHours(hora, min, 0, 0);

          const diff = dataHorario.getTime() - agora.getTime();
          const diffMinutos = diff / (1000 * 60);

          if (diffMinutos < -60) { // Mais de 1h atrasado
            status = 'atrasado';
            cor = 'danger';
            icone = 'alert-circle';
          } else if (diffMinutos <= 60 && diffMinutos > -60) { // Próxima 1h ou recente
            status = 'proximo';
            cor = 'warning';
            icone = 'time';
          }
        }
      }

      return {
        ministracao: m,
        horario: m.horario || '??:??',
        status,
        cor,
        icone
      };
    }).sort((a, b) => a.horario.localeCompare(b.horario));

    // Verificar interações medicamentosas
    this.verificarInteracoesUsuario(ativos);
  }

  async verificarInteracoesUsuario(ministracoes: MinistraLocal[]) {
    // Extrair UUIDs únicos dos medicamentos ativos
    const medicamentosUuids = [...new Set(ministracoes.map(m => m.medicamento_uuid))];

    if (medicamentosUuids.length < 2) {
      // Sem interações se o usuário toma menos de 2 medicamentos diferentes
      this.interacoesUsuario = [];
      return;
    }

    // Buscar interações entre os medicamentos do usuário
    this.interacoesUsuario = await this.interacaoService.buscarInteracoesEntreMedicamentos(medicamentosUuids);
  }

  async marcarComoTomado(item: MedicamentoView) {
    const alert = await this.alertController.create({
      header: 'Confirmar',
      message: `Você tomou ${item.ministracao.medicamento_nome}?`,
      cssClass: 'alert-dinda',
      buttons: [
        {
          text: 'Não',
          role: 'cancel',
          cssClass: 'alert-button-cancel'
        },
        {
          text: 'Sim, tomei',
          cssClass: 'alert-button-confirm',
          handler: async () => {
            await this.ministraService.registrarTomada(item.ministracao.uuid);
            await this.mostrarToastSucesso(
              `${item.ministracao.medicamento_nome} marcado como tomado! 👍`
            );
          }
        }
      ]
    });
    await alert.present();
  }

  async verDetalhes(item: MedicamentoView) {
    const m = item.ministracao;

    // Monta a mensagem com quebras de linha
    const detalhes = [
      `📋 Dosagem: ${m.dosagem || 'Não informada'}`,
      `🕐 Horário: ${m.horario || 'Não informado'}`,
      `🔄 Frequência: ${m.frequencia ? m.frequencia + 'x por dia' : 'Não informada'}`
    ];

    if (m.medicamento_classe) {
      detalhes.push(`💊 Classe: ${m.medicamento_classe}`);
    }

    const alert = await this.alertController.create({
      header: m.medicamento_nome || 'Detalhes do Medicamento',
      cssClass: 'modal-dinda',
      message: detalhes.join('\n\n'),
      buttons: [
        {
          text: 'Fechar',
          role: 'cancel',
          cssClass: 'alert-button-primary'
        }
      ]
    });

    await alert.present();
  }

  async mostrarToastSucesso(mensagem: string) {
    const toast = await this.toastController.create({
      message: mensagem,
      duration: 3000,
      position: 'top',
      color: 'success',
      cssClass: 'toast-dinda',
      icon: 'checkmark-circle'
    });
    await toast.present();
  }

  getStatusBadge(status: string): string {
    const badges: Record<string, string> = {
      'tomado': 'Feito',
      'proximo': 'Próximo',
      'pendente': 'Pendente',
      'atrasado': 'Atrasado'
    };
    return badges[status] || 'Pendente';
  }

  adicionarMedicamento() {
    this.navCtrl.navigateForward('/app/tab2');
  }

  // Ações do Farmacêutico
  gerenciarMedicamentos() {
    this.navCtrl.navigateForward('app/tab2');
  }

  gerenciarFaqs() {
    this.navCtrl.navigateForward('app/tab3');
  }

  gerenciarDicas() {
    this.navCtrl.navigateForward('app/tab6');
  }

  gerenciarInteracoes() {
    this.navCtrl.navigateForward('app/tab5');
  }

}
