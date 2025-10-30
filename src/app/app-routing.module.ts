import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard'; // Importe o guarda

const routes: Routes = [
  // Rota pública de Login
  {
    path: 'login',
    loadChildren: () => import('./auth/login/login.module').then( m => m.LoginPageModule)
    // Adicionar um guarda aqui para redirecionar se JÁ estiver logado (opcional)
  },
  // Rota pública de Cadastro
  {
    path: 'cadastro',
    loadChildren: () => import('./auth/cadastro/cadastro.module').then( m => m.CadastroPageModule)
  },
  // Rota protegida para o app principal (Tabs)
  {
    path: 'app',
    loadChildren: () => import('./tabs/tabs.module').then(m => m.TabsPageModule),
    canActivate: [AuthGuard] // AQUI ESTÁ A PROTEÇÃO
  },
  // Redirecionamento inicial
  {
    path: '',
    redirectTo: 'app/tab1', // Tenta ir para o app
    pathMatch: 'full'
    // O AuthGuard em 'app' vai pegar e redirecionar para 'login' se não estiver logado
  }
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule {}
