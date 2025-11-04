interface BackendAuthResponse {
  accessToken?: string;
  token?: string;
  usuario?: {
    idusuario?: number;
    id?: number;
    nome?: string;
    name?: string;
    email?: string;
    tipo_usuario?: string;
    tipo?: string;
  };
  user?: {
    id?: number;
    idusuario?: number;
    nome?: string;
    name?: string;
    email?: string;
    tipo_usuario?: string;
    tipo?: string;
  };
}

export interface AuthData {
  token: string;
  usuario: {
    idusuario: number;
    nome: string;
    email: string;
    tipo_usuario: 'CLIENTE' | 'FARMACEUTICO';
  };
}

// Função helper para normalizar resposta do backend
export function normalizeAuthResponse(response: BackendAuthResponse): AuthData {
  // Tenta extrair o token
  const token = response.token || response.accessToken;

  // Tenta extrair o usuário
  const rawUser = response.usuario || response.user;

  if (!token || !rawUser) {
    throw new Error('Resposta de login inválida');
  }

  return {
    token,
    usuario: {
      idusuario: rawUser.idusuario || rawUser.id || 0,
      nome: rawUser.nome || rawUser.name || '',
      email: rawUser.email || '',
      tipo_usuario: (rawUser.tipo_usuario || rawUser.tipo || 'CLIENTE') as 'CLIENTE' | 'FARMACEUTICO'
    }
  };
}
