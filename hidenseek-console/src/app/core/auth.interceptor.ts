import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

const withToken = (req: HttpRequest<unknown>, token: string | null) =>
  token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

/** Adds the access token to API calls; on a 401, refreshes once and retries. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/') || req.url.startsWith('/api/v1/public/')) return next(req);
  const auth = inject(AuthService);
  const router = inject(Router);
  return next(withToken(req, auth.accessToken())).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) return throwError(() => error);
      return from(auth.refresh()).pipe(
        switchMap((ok) => {
          if (!ok) {
            void router.navigate(['/sign-in']);
            return throwError(() => error);
          }
          return next(withToken(req, auth.accessToken()));
        }),
      );
    }),
  );
};
