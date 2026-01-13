import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { AuthService } from '../services/auth';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  standalone: false,
})
export class TabsPage implements OnInit, OnDestroy {
  private authService = inject(AuthService);


  isFarmaceutico = false;
  private subscription?: Subscription;

  ngOnInit() {
    // Subscreve ao estado de autenticação para atualizar o tipo de usuário
    this.subscription = this.authService.isAuthenticated$.subscribe(async (isAuth) => {
      if (isAuth) {
        const user = await this.authService.getCurrentUser();
        this.isFarmaceutico = user?.tipo_usuario === 'FARMACEUTICO';
      } else {
        this.isFarmaceutico = false;
      }
    });
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
  }

}
