import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  await auth.init();
  return auth.user() ? true : inject(Router).createUrlTree(['/sign-in']);
};

/** Admin pages; other signed-in users land on their own page. */
export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  await auth.init();
  if (!auth.user()) return inject(Router).createUrlTree(['/sign-in']);
  return auth.isAdmin() ? true : inject(Router).createUrlTree(['/me']);
};

export const signedOutGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  await auth.init();
  return auth.user() ? inject(Router).createUrlTree([auth.isAdmin() ? '/dashboard' : '/me']) : true;
};
