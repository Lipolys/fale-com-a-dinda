import { Component, OnInit } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular';

interface Medicamento {
  id: number;
  nome: string;
  dosagem: string;
  horario: string;
  observacoes: string;
  status: 'tomado' | 'proximo' | 'pendente';
  cor: string;
  icone: string;
}

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  standalone: false,
})
export class Tab1Page implements OnInit {

  medicamentos: Medicamento[] = [
    {
      id: 1,
      nome: 'Dipirona 500mg',
      dosagem: '1 comprimido',
      horario: '8h00',
      observacoes: 'Tomar após café',
      status: 'tomado',
      cor: 'success',
      icone: 'checkmark-circle'
    },
    {
      id: 2,
      nome: 'Losartana 50mg',
      dosagem: '1 comprimido',
      horario: '14h00',
      observacoes: 'Tomar com água',
      status: 'proximo',
      cor: 'warning',
      icone: 'time'
    },
    {
      id: 3,
      nome: 'Metformina 850mg',
      dosagem: '1 comprimido',
      horario: '20h00',
      observacoes: 'Após jantar',
      status: 'pendente',
      cor: 'medium',
      icone: 'ellipse-outline'
    }
  ];

  mostrarAlertaProximo = true;
  temInteracao = true;

  constructor(
    private alertController: AlertController,
    private toastController: ToastController
  ) {}

  ngOnInit() {
    this.verificarProximoMedicamento();
  }

  /**
   * Verifica se há medicamento próximo para tomar
   */
  verificarProximoMedicamento() {
    const proximo = this.medicamentos.find(m => m.status === 'proximo');
    if (proximo && this.mostrarAlertaProximo) {
    }
  }

  /**
   * Marca medicamento como tomado
   */
  async marcarComoTomado(medicamento: Medicamento) {
    const alert = await this.alertController.create({
      header: 'Confirmar',
      message: `Você tomou ${medicamento.nome}?`,
      cssClass: 'alert-dinda',
      buttons: [
        {
          text: 'Não',
          role: 'cancel',
          cssClass: 'alert-button-cancel',
          handler: () => {
            console.log('Cancelado');
          }
        },
        {
          text: 'Sim, tomei',
          cssClass: 'alert-button-confirm',
          handler: async () => {
            medicamento.status = 'tomado';
            medicamento.cor = 'success';
            medicamento.icone = 'checkmark-circle';

            await this.mostrarToastSucesso(
              `${medicamento.nome} marcado como tomado! 👍`
            );
          }
        }
      ]
    });

    await alert.present();
  }

  /**
   * Visualiza detalhes do medicamento
   */
  async verDetalhes(medicamento: Medicamento) {
    const alert = await this.alertController.create({
      header: medicamento.nome,
      cssClass: 'modal-dinda',
      message: `
        <div style="text-align: left; font-size: 18px; line-height: 1.8;">
          <p><strong>📋 Dosagem:</strong><br>${medicamento.dosagem}</p>
          <p><strong>🕐 Horário:</strong><br>${medicamento.horario}</p>
          <p><strong>📝 Observações:</strong><br>${medicamento.observacoes}</p>
        </div>
      `,
      buttons: [
        {
          text: 'Editar',
          cssClass: 'alert-button-outline',
          handler: () => {
            this.editarMedicamento(medicamento);
          }
        },
        {
          text: 'Fechar',
          role: 'cancel',
          cssClass: 'alert-button-primary'
        }
      ]
    });

    await alert.present();
  }

  /**
   * Adiciona novo medicamento
   */
  async adicionarMedicamento() {
    const alert = await this.alertController.create({
      header: '➕ Novo Remédio',
      cssClass: 'modal-dinda',
      inputs: [
        {
          name: 'nome',
          type: 'text',
          placeholder: 'Nome do remédio',
          cssClass: 'input-dinda'
        },
        {
          name: 'dosagem',
          type: 'text',
          placeholder: 'Dosagem (ex: 1 comprimido)',
          cssClass: 'input-dinda'
        },
        {
          name: 'horario',
          type: 'time',
          placeholder: 'Horário',
          cssClass: 'input-dinda'
        },
        {
          name: 'observacoes',
          type: 'textarea',
          placeholder: 'Observações',
          cssClass: 'input-dinda'
        }
      ],
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
            if (!data.nome || !data.dosagem || !data.horario) {
              await this.mostrarToastErro(
                'Por favor, preencha todos os campos obrigatórios'
              );
              return false;
            }

            const novoMedicamento: Medicamento = {
              id: this.medicamentos.length + 1,
              nome: data.nome,
              dosagem: data.dosagem,
              horario: data.horario,
              observacoes: data.observacoes || '',
              status: 'pendente',
              cor: 'medium',
              icone: 'ellipse-outline'
            };

            this.medicamentos.push(novoMedicamento);

            await this.mostrarToastSucesso(
              `${data.nome} adicionado com sucesso! ✅`
            );

            return true;
          }
        }
      ]
    });

    await alert.present();
  }

  /**
   * Edita medicamento existente
   */
  editarMedicamento(medicamento: Medicamento) {
    // Implementar navegação para página de edição
    console.log('Editando:', medicamento);
  }

  /**
   * Ver histórico de medicamentos
   */
  verHistorico() {
    // Implementar navegação para página de histórico
    console.log('Ver histórico');
  }

  /**
   * Mostra toast de sucesso
   */
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

  /**
   * Mostra toast de erro
   */
  async mostrarToastErro(mensagem: string) {
    const toast = await this.toastController.create({
      message: mensagem,
      duration: 3000,
      position: 'top',
      color: 'danger',
      cssClass: 'toast-dinda',
      icon: 'close-circle'
    });
    await toast.present();
  }

  /**
   * Formata status para exibição
   */
  getStatusBadge(status: string): string {
    const badges: Record<string, string> = {
      'tomado': 'Feito',
      'proximo': 'Próximo',
      'pendente': 'Pendente'
    };
    return badges[status] || 'Pendente';
  }

  /**
   * Calcula tempo até próximo medicamento
   */
  getTempoRestante(horario: string): string {
    // Implementar cálculo real baseado em horário
    // Este é apenas um exemplo
    return 'Em 30 minutos';
  }
}
