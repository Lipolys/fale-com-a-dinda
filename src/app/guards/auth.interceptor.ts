import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, from, throwError, BehaviorSubject } from 'rxjs';
import { switchMap, catchError, filter, take } from 'rxjs/operators';
import { AuthService } from '../services/auth';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {

  private isRefreshing = false;
  private refreshTokenSubject = new BehaviorSubject<string | null>(null);

  constructor(private authService: AuthService) { }

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Não adiciona token em rotas públicas
    if (this.isPublicRoute(req.url)) {
      return next.handle(req);
    }

    // Adiciona Access Token
    return from(this.authService.getAccessToken()).pipe(
      switchMap(token => {
        if (token) {
          req = this.addToken(req, token);
        }

        return next.handle(req).pipe(
          catchError(error => {
            if (error instanceof HttpErrorResponse && error.status === 401) {
              return this.handle401Error(req, next);
            }
            return throwError(() => error);
          })
        );
      })
    );
  }

  /**
   * Adiciona token ao header da requisição
   */
  private addToken(req: HttpRequest<any>, token: string): HttpRequest<any> {
    return req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  /**
   * Verifica se é rota pública (não precisa de auth)
   */
  private isPublicRoute(url: string): boolean {
    const publicRoutes = ['/usuario/login', '/usuario/cadastrar', '/usuario/refresh'];
    return publicRoutes.some(route => url.includes(route));
  }

  /**
   * Trata erro 401 (tentando renovar o token)
   */
  private handle401Error(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (!this.isRefreshing) {
      this.isRefreshing = true;
      this.refreshTokenSubject.next(null);

      return from(this.authService.refreshAccessToken()).pipe(
        switchMap(tokens => {
          this.isRefreshing = false;

          if (tokens) {
            this.refreshTokenSubject.next(tokens.accessToken);
            return next.handle(this.addToken(req, tokens.accessToken));
          }

          // Refresh falhou, desloga
          // Suppress error message to avoid "Token expired" alert
          return from(this.authService.logout()).pipe(
            switchMap(() => {
              // Retorna um observable vazio ou um erro tratado para não disparar alertas globais
              // Se preferir lançar erro, lance um com mensagem amigável
              return throwError(() => new Error('Sessão expirada. Por favor, faça login novamente.'));
            })
          );
        }),
        catchError(err => {
          this.isRefreshing = false;
          return from(this.authService.logout()).pipe(
            switchMap(() => throwError(() => new Error('Sessão expirada. Por favor, faça login novamente.')))
          );
        })
      );
    }

    // Se já está refreshing, aguarda
    return this.refreshTokenSubject.pipe(
      filter(token => token !== null),
      take(1),
      switchMap(token => next.handle(this.addToken(req, token!)))
    );
  }
}
