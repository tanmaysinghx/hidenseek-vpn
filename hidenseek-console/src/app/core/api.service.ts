import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  ActivityEvent, Dashboard, DomainStat, Enrollment, Page, Server, Session, User, UserInsights, UserStatus,
} from './models';

type Params = Record<string, string | number | boolean | null | undefined>;

function params(values: Params): HttpParams {
  let p = new HttpParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined && value !== '') p = p.set(key, String(value));
  }
  return p;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  dashboard(days: number) {
    return this.http.get<Dashboard>('/api/v1/admin/insights/dashboard', { params: params({ days }) });
  }

  userInsights(id: string, days: number) {
    return this.http.get<UserInsights>(`/api/v1/admin/insights/users/${id}`, { params: params({ days }) });
  }

  websites(days: number, userId?: string | null, limit = 50) {
    return this.http.get<DomainStat[]>('/api/v1/admin/insights/websites', { params: params({ days, userId, limit }) });
  }

  activity(filter: { userId?: string | null; q?: string | null; days?: number; page?: number; size?: number }) {
    return this.http.get<Page<ActivityEvent>>('/api/v1/admin/activity', { params: params(filter) });
  }

  users() {
    return this.http.get<User[]>('/api/v1/admin/users');
  }

  setUserStatus(id: string, status: UserStatus) {
    return this.http.patch<User>(`/api/v1/admin/users/${id}`, { status });
  }

  sessions(filter: { userId?: string | null; active?: boolean; page?: number; size?: number }) {
    return this.http.get<Page<Session>>('/api/v1/admin/sessions', { params: params(filter) });
  }

  mySessions(page = 0, size = 50) {
    return this.http.get<Page<Session>>('/api/v1/sessions', { params: params({ page, size }) });
  }

  servers() {
    return this.http.get<Server[]>('/api/v1/admin/nodes');
  }

  createServer(body: Partial<Server>) {
    return this.http.post<Server>('/api/v1/admin/nodes', body);
  }

  updateServer(id: string, body: Partial<Server>) {
    return this.http.patch<Server>(`/api/v1/admin/nodes/${id}`, body);
  }

  deleteServer(id: string) {
    return this.http.delete<void>(`/api/v1/admin/nodes/${id}`);
  }

  enrollment(id: string) {
    return this.http.post<Enrollment>(`/api/v1/admin/nodes/${id}/enrollment`, null);
  }
}
