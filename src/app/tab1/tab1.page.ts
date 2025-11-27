import { Component, OnInit, OnDestroy } from '@angular/core';
import { AlertController, ToastController, NavController } from '@ionic/angular';
import { MinistraService } from '../services/ministra';
import { MinistraLocal } from '../models/local.models';
import { Subscription } from 'rxjs';

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

  medicamentosHoje: MedicamentoView[] = [];
  private subscription?: Subscription;

  constructor(
    private alertController: AlertController,
    private toastController: ToastController,
    private ministraService: MinistraService,
    private navCtrl: NavController
  ) { }

  ngOnInit() {
    this.subscription = this.ministraService.ministra$.subscribe(ministracoes => {
      this.atualizarListaHoje(ministracoes);
    });
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
  }

  atualizarListaHoje(ministracoes: MinistraLocal[]) {
    const hoje = new Date().toISOString().split('T')[0];

    // Filtra apenas ativos (status 1)
    const ativos = ministracoes.filter(m => m.status === 1);

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
    const alert = await this.alertController.create({
      header: m.medicamento_nome,
      cssClass: 'modal-dinda',
      message: `
        <div style="text-align: left; font-size: 18px; line-height: 1.8;">
          <p><strong>📋 Dosagem:</strong><br>${m.dosagem || 'Não informada'}</p>
          <p><strong>🕐 Horário:</strong><br>${m.horario || 'Não informado'}</p>
          <p><strong>🔄 Frequência:</strong><br>${m.frequencia ? m.frequencia + 'h' : 'Não informada'}</p>
        </div>
      `,
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
    this.navCtrl.navigateForward('/tabs/tab2');
  }

  verHistorico() {
    this.navCtrl.navigateForward('/tabs/tab2');
  }
}
