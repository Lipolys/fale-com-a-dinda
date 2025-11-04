/**
 * Interfaces para autenticação
 */

export type TipoUsuario = 'CLIENTE' | 'FARMACEUTICO';

// Formato interno usado pelo frontend
export interface Usuario {
  idusuario: number;
  nome: string;
  email: string;
  tipo_usuario: TipoUsuario;
}

export interface AuthData {
  token: string;
  usuario: Usuario;
}

// Formato real retornado pelo backend
export interface BackendLoginResponse {
  token: string;
  usuario: {
    id: number;
    nome: string;
    email: string;
    tipo: string;
  };
}

/**
 * Adaptador: converte a resposta do backend para o formato interno
 */
export function adaptBackendAuthResponse(backendResponse: BackendLoginResponse): AuthData {
  return {
    token: backendResponse.token,
    usuario: {
      idusuario: backendResponse.usuario.id,
      nome: backendResponse.usuario.nome,
      email: backendResponse.usuario.email,
      tipo_usuario: backendResponse.usuario.tipo as TipoUsuario
    }
  };
}

