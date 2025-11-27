import { Component, OnInit } from '@angular/core';
import { AuthService } from '../services/auth';
import { Usuario } from '../models/auth.model';
import { AlertController, LoadingController } from '@ionic/angular';

@Component({
  selector: 'app-tab4',
  templateUrl: './tab4.page.html',
  styleUrls: ['./tab4.page.scss'],
  standalone: false
})
export class Tab4Page implements OnInit {

  usuario: Usuario | null = null;
  versaoApp = '1.0.0';

  constructor(
    private authService: AuthService,
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController
  ) { }

  async ngOnInit() {
    await this.carregarPerfil();
  }

  async carregarPerfil() {
    this.usuario = await this.authService.getCurrentUser();
  }

  async logout() {
    const alert = await this.alertCtrl.create({
      header: 'Sair do App',
      message: 'Tem certeza que deseja sair?',
      cssClass: 'modal-dinda',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
          cssClass: 'alert-button-cancel'
        },
        {
          text: 'Sair',
          cssClass: 'alert-button-danger',
          handler: async () => {
            await this.realizarLogout();
          }
        }
      ]
    });

    await alert.present();
  }

  private async realizarLogout() {
    const loading = await this.loadingCtrl.create({
      message: 'Saindo...',
      duration: 2000 // Timeout de segurança
    });
    await loading.present();

    try {
      await this.authService.logout();
    } catch (error) {
      console.error('Erro ao sair:', error);
    } finally {
      await loading.dismiss();
    }
  }
}
