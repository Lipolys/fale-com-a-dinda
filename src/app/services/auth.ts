import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, from } from 'rxjs';
import { tap, switchMap, catchError, filter, map } from 'rxjs/operators';
import { StorageService, STORAGE_KEYS } from './storage';
import { environment } from '../../environments/environment';
import { Router } from '@angular/router';
import {
  AuthData,
  TokenData,
  Usuario,
  BackendLoginResponse,
  BackendRefreshResponse,
  TipoUsuario
} from '../models/auth.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly API_URL = environment.apiUrl;

  // BehaviorSubject para saber o estado de autenticação
  private authState = new BehaviorSubject<boolean | null>(null);

  // Observable público
  public isAuthenticated$: Observable<boolean> = this.authState.asObservable().pipe(
    filter((value): value is boolean => value !== null)
  );

  // Observable para o AuthGuard
  public authStateForGuard$: Observable<boolean | null> = this.authState.asObservable();

  constructor(
    private http: HttpClient,
    private storage: StorageService,
    private router: Router,
  ) {
    this.verificarAutenticacaoInicial();
  }

  /**
   * Verifica no storage se já existe um token válido ao iniciar o app
   */
  async verificarAutenticacaoInicial(): Promise<void> {
    try {
      const authData = await this.storage.get<AuthData>(STORAGE_KEYS.AUTH_DATA);
      this.authState.next(!!authData?.accessToken);
    } catch (error) {
      console.error('Erro ao verificar autenticação inicial:', error);
      this.authState.next(false);
    }
  }

  /**
   * Tenta fazer o login no backend
   * Agora retorna Access Token + Refresh Token
   */
  login(email: string, senha: string): Observable<AuthData> {
    return this.http.post<BackendLoginResponse>(`${this.API_URL}/usuario/login`, { email, senha })
      .pipe(
        switchMap(response => {
          // Converte telefone para string de forma segura
          let telefone: string | undefined = undefined;
          if (response.usuario.telefone !== null && response.usuario.telefone !== undefined) {
            telefone = String(response.usuario.telefone);
          }

          const authData: AuthData = {
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
            expiresIn: response.expiresIn,
            usuario: {
              idusuario: response.usuario.id,
              nome: response.usuario.nome,
              email: response.usuario.email,
              telefone: telefone,
              tipo_usuario: response.usuario.tipo as TipoUsuario
            }
          };


          return from(this.storage.set(STORAGE_KEYS.AUTH_DATA, authData)).pipe(
            tap(() => this.authState.next(true)),
            map(() => authData)
          );
        }),
        catchError(err => {
          console.error('Erro no login:', err);
          this.authState.next(false);
          throw new Error('Email ou senha inválidos');
        })
      );
  }

  /**
   * Renova o Access Token usando o Refresh Token
   * Implementa o fluxo de Rotating Refresh Tokens
   */
  async refreshAccessToken(): Promise<TokenData | null> {
    try {
      const authData = await this.storage.get<AuthData>(STORAGE_KEYS.AUTH_DATA);

      if (!authData?.refreshToken) {
        console.error('Refresh token não encontrado');
        return null;
      }

      const response = await this.http.post<BackendRefreshResponse>(
        `${this.API_URL}/usuario/refresh`,
        { refreshToken: authData.refreshToken }
      ).toPromise();

      if (response) {
        // Atualiza os tokens armazenados
        const novaAuthData: AuthData = {
          ...authData,
          accessToken: response.accessToken,
          refreshToken: response.refreshToken, // IMPORTANTE: Token rotacionado
          expiresIn: response.expiresIn
        };

        await this.storage.set(STORAGE_KEYS.AUTH_DATA, novaAuthData);

        console.log('✅ Tokens renovados com sucesso');
        return {
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
          expiresIn: response.expiresIn
        };
      }

      return null;

    } catch (error: any) {
      console.error('❌ Erro ao renovar token:', error);

      // Se o refresh token é inválido/revogado, desloga
      if (error.error?.deveFazerLogin) {
        console.warn('⚠️ Refresh token inválido/revogado. Fazendo logout...');
        await this.logout();
      }

      return null;
    }
  }

  /**
   * Obtém o Access Token atual
   */
  async getAccessToken(): Promise<string | null> {
    const authData = await this.storage.get<AuthData>(STORAGE_KEYS.AUTH_DATA);
    return authData?.accessToken || null;
  }

  /**
   * Obtém o Refresh Token atual
   */
  async getRefreshToken(): Promise<string | null> {
    const authData = await this.storage.get<AuthData>(STORAGE_KEYS.AUTH_DATA);
    return authData?.refreshToken || null;
  }

  /**
   * Tenta cadastrar um novo usuário no backend
   */
  cadastrar(dados: any): Observable<any> {
    return this.http.post<any>(`${this.API_URL}/usuario/cadastrar`, dados)
      .pipe(
        catchError(err => {
          console.error('Erro no cadastro:', err);
          throw new Error(err.error?.erro || 'Erro ao tentar cadastrar');
        })
      );
  }

  /**
   * Faz o logout do usuário
   * Invalida o refresh token no servidor
   */
  async logout(): Promise<void> {
    const authData = await this.storage.get<AuthData>(STORAGE_KEYS.AUTH_DATA);

    // Tenta invalidar o refresh token no servidor
    if (authData?.refreshToken) {
      try {
        await this.http.post(
          `${this.API_URL}/usuario/logout`,
          { refreshToken: authData.refreshToken }
        ).toPromise();
      } catch (error) {
        console.error('Erro ao invalidar token no servidor:', error);
        // Continua com o logout local mesmo se falhar no servidor
      }
    }

    // Limpa TODOS os dados do storage para evitar que dados do usuário anterior apareçam
    await this.storage.clear();

    this.authState.next(false);
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  /**
   * Faz logout de TODOS os dispositivos
   * Requer autenticação (Access Token)
   */
  async logoutTodosDispositivos(): Promise<void> {
    try {
      const token = await this.getAccessToken();

      if (!token) {
        throw new Error('Token não disponível');
      }

      await this.http.post(
        `${this.API_URL}/usuario/logout-todos`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      ).toPromise();

      // Limpa TODOS os dados do storage
      await this.storage.clear();

      this.authState.next(false);
      this.router.navigateByUrl('/login', { replaceUrl: true });

    } catch (error) {
      console.error('Erro ao deslogar todos dispositivos:', error);
      throw error;
    }
  }

  /**
   * Lista sessões ativas do usuário
   */
  async listarSessoes(): Promise<any[]> {
    try {
      const token = await this.getAccessToken();

      if (!token) {
        throw new Error('Token não disponível');
      }

      const sessoes = await this.http.get<any[]>(
        `${this.API_URL}/usuario/sessoes`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      ).toPromise();

      return sessoes || [];

    } catch (error) {
      console.error('❌ Erro ao listar sessões:', error);
      return [];
    }
  }

  /**
   * Obtém os dados de autenticação guardados
   */
  async getAuthData(): Promise<AuthData | null> {
    return await this.storage.get<AuthData>(STORAGE_KEYS.AUTH_DATA);
  }

  /**
   * Obtém o ID do usuário atual como string
   */
  async getCurrentUserUuid(): Promise<string | null> {
    const authData = await this.getAuthData();
    return authData?.usuario?.idusuario?.toString() || null;
  }

  /**
   * Obtém dados do usuário atual
   */
  async getCurrentUser(): Promise<Usuario | null> {
    const authData = await this.getAuthData();
    return authData?.usuario || null;
  }
}
