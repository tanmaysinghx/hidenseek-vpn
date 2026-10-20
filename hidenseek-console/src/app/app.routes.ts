import { Routes } from '@angular/router';
import { adminGuard, authGuard, signedOutGuard } from './core/guards';

// Every page is lazy-loaded, so the sign-in screen doesn't download the charts.
export const routes: Routes = [
  {
    path: 'sign-in',
    canActivate: [signedOutGuard],
    loadComponent: () => import('./features/sign-in/sign-in').then((m) => m.SignIn),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.DashboardPage),
      },
      {
        path: 'users',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/users/users').then((m) => m.UsersPage),
      },
      {
        path: 'users/:id',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/users/user-detail').then((m) => m.UserDetailPage),
      },
      {
        path: 'plans',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/plans/plans').then((m) => m.PlansPage),
      },
      {
        path: 'sessions',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/sessions/sessions').then((m) => m.SessionsPage),
      },
      {
        path: 'websites',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/websites/websites').then((m) => m.WebsitesPage),
      },
      {
        path: 'servers',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/servers/servers').then((m) => m.ServersPage),
      },
      { path: 'me', loadComponent: () => import('./features/me/me').then((m) => m.MePage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
