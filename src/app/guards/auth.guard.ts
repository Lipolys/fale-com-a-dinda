// src/app/guards/auth.guard.ts
import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { Observable } from 'rxjs';
import { map, filter, take } from 'rxjs/operators';
import { AuthService } from '../services/auth';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(): Observable<boolean> {
    return this.authService.authStateForGuard$.pipe(
      // 1. Filtra o estado inicial 'null' (verificando)
      filter(state => state !== null),

      // 2. Pega apenas o primeiro valor emitido (true ou false)
      take(1),

      // 3. Processa o resultado
      map(isAuthenticated => {
        if (isAuthenticated) {
          return true; // Usuário logado, pode aceder
        }

        // Usuário não logado, redireciona para login
        console.log('AuthGuard: Usuário não logado, redirecionando para /login');
        this.router.navigateByUrl('/login', { replaceUrl: true });
        return false;
      })
    );
  }
}
