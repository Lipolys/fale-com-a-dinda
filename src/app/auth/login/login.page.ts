import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-login',
  templateUrl: 'login.page.html',
  styleUrls: ['login.page.scss'],
  standalone: false
})
export class LoginPage implements OnInit {

  loginForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      senha: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  ngOnInit() {
  }

  async submitLogin() {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const loading = await this.loadingCtrl.create({
      message: 'A entrar...',
    });
    await loading.present();

    const { email, senha } = this.loginForm.value;

    this.authService.login(email, senha).subscribe({
      next: () => {
        loading.dismiss();
        this.router.navigateByUrl('app', { replaceUrl: true });
      },
      error: async (err) => {
        loading.dismiss();

        const toast = await this.toastCtrl.create({
          message: err.message || 'Email ou senha inválidos.',
          duration: 3000,
          color: 'danger',
          position: 'top',
        });
        await toast.present();
      }
    });
  }
}
