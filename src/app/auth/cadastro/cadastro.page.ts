import { Component, OnInit } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { AuthService } from '../../services/auth';

// Função Validadora Customizada
export const senhasConferemValidator: ValidatorFn = (
  control: AbstractControl
): ValidationErrors | null => {
  const senha = control.get('senha');
  const confirmarSenha = control.get('confirmarSenha');

  return senha && confirmarSenha && senha.value !== confirmarSenha.value
    ? { senhasNaoConferem: true }
    : null;
};


@Component({
  selector: 'app-cadastro',
  templateUrl: 'cadastro.page.html',
  styleUrls: ['cadastro.page.scss'],
  standalone: false,
})
export class CadastroPage implements OnInit {

  cadastroForm: FormGroup;
  maxDate: string;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {
    // Define data máxima para nascimento (ex: 18 anos atrás)
    const hoje = new Date();
    hoje.setFullYear(hoje.getFullYear() - 18);
    this.maxDate = hoje.toISOString().split('T')[0];

    this.cadastroForm = this.fb.group({
      nome: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      data_nascimento: [null, [Validators.required]],
      telefone: ['', [Validators.required, Validators.minLength(10)]],
      senha: ['', [Validators.required, Validators.minLength(6)]],
      confirmarSenha: ['', [Validators.required]],
      tipo_usuario: ['cliente', [Validators.required]],
      crf: [''] // Sem validador inicial
    }, { validators: senhasConferemValidator }); // Adiciona validador ao grupo
  }

  ngOnInit() {
    // Observar mudanças no tipo de usuário para adicionar/remover validador do CRF
    this.cadastroForm.get('tipo_usuario')?.valueChanges.subscribe(tipo => {
      const crfControl = this.cadastroForm.get('crf');
      if (tipo === 'farmaceutico') {
        crfControl?.setValidators([Validators.required, Validators.minLength(4)]);
      } else {
        crfControl?.clearValidators();
      }
      crfControl?.updateValueAndValidity();
    });
  }

  async submitCadastro() {
    if (this.cadastroForm.invalid) {
      this.cadastroForm.markAllAsTouched();
      this.presentToast('Por favor, corrija os erros no formulário.', 'danger');
      return;
    }

    const loading = await this.loadingCtrl.create({
      message: 'A criar conta...',
    });
    await loading.present();

    // Prepara os dados para enviar (removendo o confirmarSenha)
    const dadosForm = { ...this.cadastroForm.value };
    delete dadosForm.confirmarSenha;

    // Ajusta os dados para o formato esperado pelo backend
    dadosForm.nascimento = dadosForm.data_nascimento;
    delete dadosForm.data_nascimento;

    dadosForm.tipo = dadosForm.tipo_usuario.toUpperCase();
    delete dadosForm.tipo_usuario;

    this.authService.cadastrar(dadosForm).subscribe({
      next: () => {
        loading.dismiss();
        this.presentToast('Cadastro realizado com sucesso! Faça o login.', 'success');
        this.router.navigateByUrl('/login', { replaceUrl: true }); // <-- MUDANÇA AQUI
      },
      error: async (err) => {
        loading.dismiss();
        this.presentToast(err.message || 'Erro ao cadastrar.', 'danger');
      }
    });
  }

  // Helper para Toast (se não for standalone, use this.toastCtrl.create())
  async presentToast(message: string, color: 'success' | 'danger') {
    const toast = await this.toastCtrl.create({
      message: message,
      duration: 3500,
      color: color,
      position: 'top',
    });
    await toast.present();
  }
}
