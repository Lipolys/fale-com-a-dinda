import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

const routes: Routes = [
  {
    // O 'app-routing.module.ts' já nos trouxe para cá através do path 'app'.
    // Agora, o path '' (vazio) vai carregar o componente principal (TabsPage)
    // que contém o <ion-tabs>.
    path: '',
    component: TabsPage,
    children: [
      {
        // O caminho completo será 'app/tab1'
        path: 'tab1',
        loadChildren: () => import('../tab1/tab1.module').then(m => m.Tab1PageModule)
      },
      {
        // O caminho completo será 'app/tab2'
        path: 'tab2',
        loadChildren: () => import('../tab2/tab2.module').then(m => m.Tab2PageModule)
      },
      {
        // O caminho completo será 'app/tab3'
        path: 'tab3',
        loadChildren: () => import('../tab3/tab3.module').then(m => m.Tab3PageModule)
      },
      {
        // Se o utilizador aceder apenas a 'app', redireciona para a 'tab1'
        path: '',
        redirectTo: 'tab1', // NOTA: Relativo, sem '/'
        pathMatch: 'full'
      }
    ]
  }
  // Removemos o outro redirecionamento 'redirectTo: /tabs/tab1'
  // porque o redirecionamento principal ('') já está no app-routing.module.ts
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
})
export class TabsPageRoutingModule {}
