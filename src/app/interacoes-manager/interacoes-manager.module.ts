import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { InteracoesManagerPage } from './interacoes-manager.page';

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        IonicModule
    ],
    declarations: [InteracoesManagerPage],
    exports: [InteracoesManagerPage]
})
export class InteracoesManagerPageModule { }
