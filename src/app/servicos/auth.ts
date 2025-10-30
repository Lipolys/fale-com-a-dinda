// src/app/servicos/auth.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, from } from 'rxjs';
import { tap, switchMap, catchError, filter, map } from 'rxjs/operators';
import { StorageService, STORAGE_KEYS } from './storage';
import { environment } from '../../environments/environment';
import { Router } from '@angular/router';

export interface AuthData {
  token: string;
  usuario: {
    idusuario: number;
    nome: string;
    email: string;
    tipo_usuario: 'cliente' | 'farmaceutico';
  };
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly API_URL = environment.apiUrl;

  // BehaviorSubject para saber o estado de autenticação: null = verificando, false = deslogado, true = logado
  private authState = new BehaviorSubject<boolean | null>(null);

  // Observable público que filtra o estado 'null' para que os consumidores saibam apenas se está logado ou não
  public isAuthenticated$: Observable<boolean> = this.authState.asObservable().pipe(
    filter((value): value is boolean => value !== null)
  );

  // Observable para o AuthGuard, que precisa saber dos 3 estados
  public authStateForGuard$: Observable<boolean | null> = this.authState.asObservable();

  constructor(
    private http: HttpClient,
    private storage: StorageService,
    private router: Router
  ) {
    this.verificarAutenticacaoInicial();
  }

  /**
   * Verifica no storage se já existe um token válido ao iniciar o app
   */
  async verificarAutenticacaoInicial(): Promise<void> {
    try {
      const authData = await this.storage.get<AuthData>(STORAGE_KEYS.AUTH_DATA);
      if (authData && authData.token) {
        this.authState.next(true);
      } else {
        this.authState.next(false);
      }
    } catch (error) {
      console.error('Erro ao verificar autenticação inicial:', error);
      this.authState.next(false);
    }
  }

  /**
   * Tenta fazer o login no backend
   */
  login(email: string, senha: string): Observable<AuthData> {
    return this.http.post<AuthData>(`${this.API_URL}/usuario/login`, { email, senha })
      .pipe(
        switchMap(response => {
          return from(this.storage.set(STORAGE_KEYS.AUTH_DATA, response)).pipe(
            tap(() => {
              this.authState.next(true);
            }),
            map(() => response)
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
   * Tenta cadastrar um novo usuário no backend
   */
  cadastrar(dados: any): Observable<AuthData> {
    return this.http.post<AuthData>(`${this.API_URL}/usuario/cadastrar`, dados)
      .pipe(
        switchMap(response => {
          return from(this.storage.set(STORAGE_KEYS.AUTH_DATA, response)).pipe(
            tap(() => {
              this.authState.next(true);
            }),
            map(() => response)
          );
        }),
        catchError(err => {
          console.error('Erro no cadastro:', err);
          this.authState.next(false);
          throw new Error(err.error?.erro || 'Erro ao tentar cadastrar');
        })
      );
  }

  /**
   * Faz o logout do usuário
   */
  async logout(): Promise<void> {
    await this.storage.remove(STORAGE_KEYS.AUTH_DATA);
    this.authState.next(false);
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  /**
   * Obtém os dados de autenticação guardados
   */
  async getAuthData(): Promise<AuthData | null> {
    return await this.storage.get<AuthData>(STORAGE_KEYS.AUTH_DATA);
  }
}
