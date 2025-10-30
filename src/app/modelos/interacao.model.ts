export interface Interacao {
  idmedicamento1: number;
  idmedicamento2: number;
  farmaceutico_idfarmaceutico: number;
  descricao: string;
  gravidade: ['BAIXA', 'MEDIA', 'ALTA'];
  fonte: string;
}
