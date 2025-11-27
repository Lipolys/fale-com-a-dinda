import { Component, OnInit } from '@angular/core';
import { Platform } from '@ionic/angular';
import { StorageService } from './services/storage';
import { SyncService } from './services/sync';
import { AuthService } from './services/auth';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit {
  constructor(
    private platform: Platform,
    private storageService: StorageService,
    private syncService: SyncService,
    private authService: AuthService
  ) {}

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
  }
}
