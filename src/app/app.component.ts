import { Component, OnInit, inject } from '@angular/core';
import { Platform } from '@ionic/angular';
import { StorageService } from './services/storage';
import { SyncService } from './services/sync';
import { AuthService } from './services/auth';
import { PushNotifications } from '@capacitor/push-notifications';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit {
  private platform = inject(Platform);
  private storageService = inject(StorageService);
  private syncService = inject(SyncService);
  private authService = inject(AuthService);


  async ngOnInit() {
    await this.initializeApp();
  }

  async initializeApp() {
    await this.platform.ready();
    console.log('App Component Initializing...');
    await this.storageService.init();
    console.log('Storage Initialized from AppComponent');

    // Verifica autenticação ao iniciar o app
    await this.authService.verificarAutenticacaoInicial();
    console.log('Auth State Verified from AppComponent');

    if (this.platform.is('capacitor')) {
      await this.initPush();
    }
  }

  async initPush() {
    try {
      await PushNotifications.requestPermissions();
      await PushNotifications.register();

      PushNotifications.addListener('registration', token => {
        console.info('Push Registration Success', token.value);
        // Salvar token no auth service para enviar ao backend quando logado
        this.authService.setDeviceToken(token.value);
      });

      PushNotifications.addListener('registrationError', error => {
        console.error('Push Registration Error', error);
      });

      PushNotifications.addListener('pushNotificationReceived', notification => {
        console.log('Push received:', notification);
        // Opcional: Atualizar lista de notificações se estiver na tela
      });

      PushNotifications.addListener('pushNotificationActionPerformed', notification => {
        console.log('Push action:', notification);
        // Navegar para tela de notificações
      });
    } catch (e) {
      console.error('Erro ao inicializar Push:', e);
    }
  }
}
