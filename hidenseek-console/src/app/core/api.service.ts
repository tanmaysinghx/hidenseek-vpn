import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  ActivityEvent, AdminUser, AuditFilter, AuditLog, AuditStats, DataSetId, Deleted, SystemInfo, TrafficStats, Dashboard, DomainStat, Enrollment, MyPlan, Page, Plan, PlanRequest, Server, Session,
  UserInsights, UserStatus,
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
    return this.http.get<AdminUser[]>('/api/v1/admin/users');
  }

  setUserStatus(id: string, status: UserStatus) {
    return this.http.patch<AdminUser>(`/api/v1/admin/users/${id}`, { status });
  }

  /** {@code days} null = no end date. */
  setUserPlan(id: string, planId: string, days: number | null = null) {
    return this.http.put<AdminUser>(`/api/v1/admin/users/${id}/plan`, { planId, days });
  }

  plans() {
    return this.http.get<Plan[]>('/api/v1/admin/plans');
  }

  updatePlan(id: string, body: Pick<Plan, 'name' | 'description' | 'dailyLimitBytes' | 'priceLabel'>) {
    return this.http.put<Plan>(`/api/v1/admin/plans/${id}`, body);
  }

  planRequests(pending: boolean) {
    return this.http.get<PlanRequest[]>('/api/v1/admin/plan-requests', { params: params({ pending }) });
  }

  decidePlanRequest(id: string, verb: 'approve' | 'reject', days: number | null, note: string | null) {
    return this.http.post<PlanRequest>(`/api/v1/admin/plan-requests/${id}/${verb}`, { days, note });
  }

  myPlan() {
    return this.http.get<MyPlan>('/api/v1/me/plan');
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

  auditLogs(filter: AuditFilter) {
    return this.http.get<Page<AuditLog>>('/api/v1/admin/audit-logs', { params: params({ ...filter }) });
  }

  auditStats(days: number) {
    return this.http.get<AuditStats>('/api/v1/admin/audit-logs/stats', { params: params({ days }) });
  }

  trafficStats(days: number) {
    return this.http.get<TrafficStats>('/api/v1/admin/traffic/stats', { params: params({ days }) });
  }

  system() {
    return this.http.get<SystemInfo>('/api/v1/admin/system');
  }

  /** Deletes records of one kind from before {@code before} (yyyy-MM-dd). The server keeps today. */
  purge(kind: DataSetId, before: string) {
    const path = { audit: 'audit-logs', traffic: 'traffic-events', activity: 'activity' }[kind];
    return this.http.delete<Deleted>(`/api/v1/admin/${path}`, { params: params({ before }) });
  }
}
