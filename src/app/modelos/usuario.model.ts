export interface Usuario {
  idusuario: number;
  nome: string;
  email: string;
  senha: string;
  telefone: string
  nascimento: Date;
  tipo: ['CLIENTE', 'FARMACEUTICO'];
}
