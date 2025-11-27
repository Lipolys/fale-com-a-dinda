/**
 * Interfaces para autenticação com Refresh Token
 */

export type TipoUsuario = 'CLIENTE' | 'FARMACEUTICO';

/**
 * Estrutura do usuário
 */
export interface Usuario {
  idusuario: number;
  nome: string;
  email: string;
  telefone?: string;
  tipo_usuario: TipoUsuario;
}

/**
 * Dados completos de autenticação armazenados localmente
 */
export interface AuthData {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  usuario: Usuario;
}

/**
 * Dados dos tokens de autenticação (para retorno de métodos)
 */
export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Resposta do backend no endpoint /usuario/login
 */
export interface BackendLoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  usuario: {
    id: number;
    nome: string;
    email: string;
    telefone?: string | number | null; // Aceita string, number ou null
    tipo: string;
  };
}

/**
 * Resposta do backend no endpoint /usuario/refresh
 */
export interface BackendRefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

