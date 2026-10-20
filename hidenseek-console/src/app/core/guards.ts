import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

// inject() only works before the first await (NG0203 otherwise), so each guard takes what it
// needs up front.

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.init();
  return auth.user() ? true : router.createUrlTree(['/sign-in']);
};

/** Admin pages; other signed-in users land on their own page. */
export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.init();
  if (!auth.user()) return router.createUrlTree(['/sign-in']);
  return auth.isAdmin() ? true : router.createUrlTree(['/me']);
};

export const signedOutGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.init();
  return auth.user() ? router.createUrlTree([auth.isAdmin() ? '/dashboard' : '/me']) : true;
};
