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
  cadastrar(dados: any): Observable<any> { // Alterado o tipo de retorno, pode ser 'any' ou uma interface de utilizador (sem AuthData)
    return this.http.post<any>(`${this.API_URL}/usuario/cadastrar`, dados) // Alterado para <any>
      .pipe(
        tap(() => {
          console.log('Cadastro enviado ao backend.');
        }),
        catchError(err => {
          console.error('Erro no cadastro:', err);
          // Não definimos o authState aqui
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

  async getCurrentUserUuid(): Promise<string | null> {
    const authData = await this.getAuthData();
    return authData ? authData.usuario.idusuario.toString() : null;
  }

  async getUsuarioLogado(): Promise<{ idusuario: number; nome: string; email: string; tipo_usuario: 'cliente' | 'farmaceutico'; clienteId?: number; farmaceuticoId?: number } | null> {
    const authData = await this.getAuthData();
    if (!authData) {
      return null;
    }

    const usuario = authData.usuario;

    // Se for cliente, buscar o clienteId
    if (usuario.tipo_usuario === 'cliente') {
      const cliente = await this.http.get<any>(`${this.API_URL}/cliente/usuario/${usuario.idusuario}`).toPromise();
      return { ...usuario, clienteId: cliente.idcliente };
    }

    // Se for farmacêutico, buscar o farmaceuticoId
    if (usuario.tipo_usuario === 'farmaceutico') {
      const farmaceutico = await this.http.get<any>(`${this.API_URL}/farmaceutico/usuario/${usuario.idusuario}`).toPromise();
      return { ...usuario, farmaceuticoId: farmaceutico.idfarmaceutico };
    }
  }
}
