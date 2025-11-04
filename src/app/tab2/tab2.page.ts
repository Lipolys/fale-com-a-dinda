import { Component } from '@angular/core';
import { NavController, AlertController, LoadingController } from '@ionic/angular';
import { MinistraLocal } from '../models/local.models';
import { AuthService } from '../services/auth';
import { MinistraService } from '../services/ministra';

@Component({
  selector: 'app-tab2',
  templateUrl: 'tab2.page.html',
  styleUrls: ['tab2.page.scss']
})
export class Tab2Page {

  // Variável para guardar as ministrações carregadas
  public ministracoes: MinistraLocal[] = [];

  // Guardar o ID do cliente para facilitar o uso
  private clienteId?: number;

  constructor(
    private navCtrl: NavController,
    private ministraService: MinistraService, // Serviço para CRUD de ministrações
    private authService: AuthService,         // Serviço para buscar o cliente logado
    private alertCtrl: AlertController,     // Para criar alertas (ex: confirmar exclusão)
    private loadingCtrl: LoadingController    // Para mostrar feedback de "a carregar"
  ) {}

  /**
   * Este método é chamado sempre que a página (tab) está prestes a ser exibida.
   * É ideal para recarregar dados que podem ter mudado.
   */
  ionViewWillEnter() {
    this.carregarMinistracoes();
  }

  /**
   * Carrega a lista de ministrações (remédios) do cliente logado.
   */
  async carregarMinistracoes() {
    const loading = await this.loadingCtrl.create({ message: 'A carregar remédios...' });
    await loading.present();

    try {
      // 1. Obter o utilizador logado
      const usuario = await this.authService.getUsuarioLogado();
      if (!usuario || !usuario.clienteId) {
        console.error('Utilizador não logado ou não é um cliente.');
        // Aqui você poderia mostrar um alerta ou redirecionar para o login
        this.ministracoes = []; // Limpa a lista
        return;
      }

      this.clienteId = usuario.clienteId;

      // 2. Buscar as ministrações usando o clienteId
      // O BaseService (que o MinistraService estende) permite passar parâmetros
      // que serão usados na query do backend (ex: /api/ministracoes?clienteId=123)
      // O seu backend já suporta isto na rota /cliente/:id, mas o BaseService
      // provavelmente está configurado para query params. Vamos assumir que
      // o BaseService pode lidar com { clienteId: X }
      // Se o seu BaseService não suportar query params, teríamos que ajustar o ministra.ts
      // para ter um método específico como `listarPorCliente(clienteId: number)`.

      // Assumindo que o backend em ministraControlador.js
      // na função `listarPorCliente` é chamado pela rota correta.
      // O seu ministraRotas.js usa:
      // router.get('/cliente/:id', ...).
      // O BaseService padrão pode não usar esta rota.
      // Vamos ajustar o ministra.ts (PASSO 2.1)

      // *** APÓS AJUSTE NO PASSO 2.1 ***
      // Agora podemos chamar o método customizado:

      // Ordenar por data (opcional, mas recomendado)
      this.ministracoes.sort((a, b) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime());

    } catch (error) {
      console.error('Erro ao carregar ministrações:', error);
      const alert = await this.alertCtrl.create({
        header: 'Erro',
        message: 'Não foi possível carregar a lista de remédios. Tente novamente.',
        buttons: ['OK']
      });
      await alert.present();
    } finally {
      await loading.dismiss();
    }
  }

  /**
   * Navega para a página de formulário para criar uma nova ministração.
   */
  incluir() {
    if (!this.clienteId) {
      console.error('Não é possível incluir: clienteId não definido.');
      return;
    }
    // Navega para a página /ministracao (que deve ser o seu formulário)
    // Passamos o clienteId via queryParams para que o formulário saiba
    // a quem associar a nova ministração.
    this.navCtrl.navigateForward('/ministracao', {
      queryParams: { clienteId: this.clienteId }
    });
  }

  /**
   * Navega para a página de formulário para editar uma ministração existente.
   * @param ministracao O objeto Ministracao a ser editado.
   */
  editar(ministracao: Ministracao) {
    // Navega para a página /ministracao, passando o ID da ministração
    // como parâmetro de rota. A página /ministracao (formulário)
    // deve ser capaz de ler este ID para carregar os dados.
    this.navCtrl.navigateForward(`/ministracao/${ministracao.id}`);
  }

  /**
   * Exclui uma ministração após confirmação.
   * @param ministracao O objeto Ministracao a ser excluído.
   */
  async excluir(ministracao: Ministracao) {
    const alert = await this.alertCtrl.create({
      header: 'Confirmar Exclusão',
      message: `Tem certeza que deseja excluir a ministração de "${ministracao.nomeMedicamento}"?`,
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
          cssClass: 'secondary'
        },
        {
          text: 'Excluir',
          cssClass: 'danger',
          handler: async () => {
            const loading = await this.loadingCtrl.create({ message: 'A excluir...' });
            await loading.present();
            try {
              // 1. Chamar o serviço para apagar
              await this.ministraService.deletar(ministracao.id);

              // 2. Recarregar a lista (ou remover localmente para performance)
              // this.ministracoes = this.ministracoes.filter(m => m.id !== ministracao.id);
              // É mais seguro recarregar do servidor:
              await this.carregarMinistracoes();

            } catch (error) {
              console.error('Erro ao excluir ministração:', error);
              const errorAlert = await this.alertCtrl.create({
                header: 'Erro',
                message: 'Não foi possível excluir. Tente novamente.',
                buttons: ['OK']
              });
              await errorAlert.present();
            } finally {
              await loading.dismiss();
            }
          }
        }
      ]
    });

    await alert.present();
  }
}
