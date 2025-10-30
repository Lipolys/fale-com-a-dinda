import { Component, inject } from '@angular/core';
import { Conversa } from '../modelos/conversa.model'
import { ConversaService } from '../servicos/conversa'

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  standalone: false,
})
export class Tab1Page {
  private _conversa = inject(ConversaService);
  public listaDeConversas: Conversa[] = [];
  public novoTitulo: string = "";
  public novoTexto: string = "";

  public titulo: string = "Fale com a Dinda";


  constructor() {this.carregarConversas();}

  public carregarConversas(): void {
    this.listaDeConversas = this._conversa.getConversas();
  }

  public salvarNovaConversa(): void {
    if (!this.novoTitulo || !this.novoTexto) {
      console.log("Título ou texto estão vazios");
      return;
    }

    this._conversa.adicionarNovaConversa(this.novoTitulo, this.novoTexto);

    this.novoTitulo = "";
    this.novoTexto = "";
  }


}
