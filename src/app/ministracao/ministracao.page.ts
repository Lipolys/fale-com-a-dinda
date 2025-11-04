import { Component, Input, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-ministracao',
  templateUrl: './ministracao.page.html',
  standalone: false,
})
export class MinistracaoPage implements OnInit {

  @Input() medicamento: any;
  isEdit = false;

  constructor(private modalCtrl: ModalController) { }

  ngOnInit() {
    if (this.medicamento) {
      this.isEdit = true;
    } else {
      this.medicamento = { nome: '' };
    }
  }

  dismissModal() {
    this.modalCtrl.dismiss();
  }

  save() {
    this.modalCtrl.dismiss(this.medicamento);
  }
}
