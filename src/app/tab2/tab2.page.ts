import { Component, OnInit } from '@angular/core';
import { ModalController, AlertController } from '@ionic/angular';
import { MedicamentoPage } from '../medicamento/medicamento.page';
import { MedicamentoService } from '../servicos/medicamento';

@Component({
  selector: 'app-tab2',
  templateUrl: 'tab2.page.html',
  styleUrls: ['tab2.page.scss']
})
export class Tab2Page implements OnInit {

  medicamentos: Medicamento[] = [];

  constructor(
    private modalCtrl: ModalController,
    private alertCtrl: AlertController,
    private medicamentoService: MedicamentoService
  ) {}

  ngOnInit() {

  }

  async openAddModal() {
  }

  async openEditModal(medicamento: Medicamento) {
  }

  async deleteMedicamento(id: number) {
  }
}
