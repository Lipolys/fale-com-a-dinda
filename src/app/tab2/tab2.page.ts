import { Component, OnInit, OnDestroy } from '@angular/core';
import { ModalController, AlertController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { MinistraService } from '../services/ministra';
import { MinistraLocal, CriarMinistraLocalDTO } from '../models/local.models';
import { MinistracaoPage } from '../ministracao/ministracao.page';
import { AuthService } from '../services/auth'


@Component({
  selector: 'app-tab2',
  templateUrl: 'tab2.page.html',
  styleUrls: ['tab2.page.scss'],
  standalone: false
})
export class Tab2Page implements OnInit, OnDestroy {

  // 3. Alterado de 'medicamentos' para 'ministracoes'
  ministracoes: MinistraLocal[] = [];
  private ministraSub: Subscription | undefined;

  constructor(
    private modalCtrl: ModalController,
    private alertCtrl: AlertController,
    // 4. Injetar o serviço correto
    private ministraService: MinistraService,
    private authService: AuthService // Injete o Auth para pegar o UUID do cliente
  ) {}

  ngOnInit() {
    // 5. Assinar as mudanças do BehaviorSubject
    this.ministraSub = this.ministraService.ministra$.subscribe(lista => {
      // Ordena por horário (opcional)
      this.ministracoes = lista.sort((a, b) => {
        return (a.horario || '99:99').localeCompare(b.horario || '99:99');
      });
    });
  }

  // 6. Recarregar os dados sempre que a aba for exibida
  ionViewWillEnter() {
    // Força o serviço a reler os dados do storage
    this.ministraService.recarregar();
  }

  ngOnDestroy() {
    // 7. Limpar a assinatura para evitar memory leaks
    if (this.ministraSub) {
      this.ministraSub.unsubscribe();
    }
  }

  /**
   * Abre o modal para adicionar uma nova ministração
   */
  async openAddModal() {

    const modal = await this.modalCtrl.create({
      component: MinistracaoPage,
    });

    await modal.present();

    const { data } = await modal.onDidDismiss();

    // 'data' deve conter { medicamento_uuid: string, horario: string, ... }
    if (data) {
      try {
        const dto: CriarMinistraLocalDTO = {
          medicamento_uuid: data.medicamento_uuid,
          horario: data.horario,
          dosagem: data.dosagem,
          frequencia: data.frequencia,
          status: 1 // Ativo
        };

        //Busque o UUID do cliente logado
        const clienteUuid = this.authService.getCurrentUserUuid();
        const MOCK_CLIENTE_UUID = 'mock-cliente-uuid-12345'; // Substitua!

        await this.ministraService.criar(dto, MOCK_CLIENTE_UUID);

      } catch (err) {
        console.error('Erro ao salvar ministração', err);
        // Exibir alerta de erro para o usuário
      }
    }

  }

  /**
   * Abre o modal para editar uma ministração existente
   */
  async openEditModal(ministracao: MinistraLocal) {


    const modal = await this.modalCtrl.create({
      component: MinistracaoPage,
      componentProps: {
        ministracaoExistente: ministracao
      }
    });

    await modal.present();

    const { data } = await modal.onDidDismiss();

    // 'data' deve conter { horario: string, dosagem: string, ... }
    if (data) {
      try {
        // DTO parcial para edição
        const dadosEdicao: Partial<CriarMinistraLocalDTO & { status: number }> = {
          horario: data.horario,
          dosagem: data.dosagem,
          frequencia: data.frequencia,
          status: data.status
        };

        await this.ministraService.editar(ministracao.uuid, dadosEdicao);

      } catch (err) {
        console.error('Erro ao editar ministração', err);
      }
    }
    console.log('Implementar openEditModal com a página MinistracaoModalPage');
  }

  /**
   * Confirma e deleta uma ministração
   */
  async deleteMinistracao(ministracao: MinistraLocal) {
    const alert = await this.alertCtrl.create({
      header: 'Confirmar Exclusão',
      // Tente usar o nome desnormalizado se existir
      message: `Deseja realmente remover "${ministracao.medicamento_nome || 'este item'}" da sua lista?`,
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Excluir',
          handler: async () => {
            try {
              await this.ministraService.deletar(ministracao.uuid);
            } catch (err) {
              console.error('Erro ao remover ministração', err);
              // Exibir alerta de erro
            }
          }
        }
      ]
    });

    await alert.present();
  }
}
