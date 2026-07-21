import axios, { AxiosInstance, AxiosError } from "axios";
import { ROOT_DOMAIN, orgId } from "../constants";
import type {
  AuthState,
  Connection,
  Workflow,
  BillingInfo,
  BillingSummary,
  Billing,
  TaskUsage,
  BillingCredits,
} from "../types";
import { storageService } from "./storageService";

export interface KonnectifyClientConfig {
  domain: string;
  token?: string;
}

const baseUrl = "https://a5189-service-35433930-c1bf8340.us.monday.app"; // backend

export class KonnectifyClient {
  private axiosInstance: AxiosInstance;
  private config: KonnectifyClientConfig;
  private refreshPromise: Promise<AuthState> | null = null;

  private refreshToken(email: string, password: string): Promise<AuthState> {
    if (!this.refreshPromise) {
      // to prevent making concurrent api calls for login
      this.refreshPromise = this.login(email, password, orgId).finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  constructor(config: KonnectifyClientConfig) {
    this.config = config;
    this.axiosInstance = axios.create({
      baseURL: ` ${baseUrl}/api`,
      headers: { "Content-Type": "application/json" },
    });

    // handle access token expiry
    this.axiosInstance.interceptors.response.use(
      (res) => res,
      async (error) => {
        console.log("api failed", error);
        const original = error.config;
        if (error.response?.status === 401 && !original._retry) {
          original._retry = true;
          const tenant = await storageService.getTenant();
          const email = tenant?.email ? tenant.email : "";
          const password = tenant?.password ? tenant.password : "";
          if (email && password) {
            const fresh = await this.refreshToken(email, password);
            this.setAuthToken(fresh.accessToken);
            await storageService.setAuth(fresh);
            original.data = JSON.parse(original.data || "{}");
            original.data.token = fresh.accessToken;
            original.data = JSON.stringify(original.data);
            console.log("failed api call's payload with fresh access token", original.data);
            return this.axiosInstance(original);
          }
        }
        return Promise.reject(error);
      }
    );

    if (config.token) {
      this.setAuthToken(config.token);
    }
  }

  get domain(): string {
    return this.config.domain;
  }

  setAuthToken(token: string): void {
    // console.log("setting new access token", token);
    this.config.token = token;
  }

  async registerUser(
    email: string,
    password: string,
    name: string,
    orgId: string,
    projectId: string,
    website?: string,
    accountId?: string,
    appId?: string
  ): Promise<AuthState> {
    const response = await axios.post<{ accessToken: string }>(`${baseUrl}/api/user/register`, {
      domain: `${this.config.domain}${ROOT_DOMAIN}`,
      email,
      password,
      name,
      website: website || "",
      orgId,
      projectId,
      accountId,
      appId,
    });
    return { accessToken: response.data.accessToken, email };
  }

  async getBootstrapToken(email: string, password: string): Promise<string> {
    const response = await axios.post<{ token: string }>(`${baseUrl}/api/user/auth/bootstrap-token`, {
      email,
      password,
      domain: this.config.domain,
    });
    // The response has both `token` (120s bootstrap token for iframes) and
    // `accessToken` (long-lived service token). We only want the bootstrap token here.
    return response.data.token;
  }

  async login(email: string, password: string, orgId: string): Promise<AuthState> {
    const response = await axios.post<{ accessToken: string }>(`${baseUrl}/api/user/login`, {
      email,
      password,
      domain: this.config.domain,
    });
    return { accessToken: response.data.accessToken, email };
  }

  async validateSession(): Promise<boolean> {
    try {
      await this.axiosInstance.post("/user/session", {
        domain: this.config.domain,
        token: this.config.token,
      });
      return true;
    } catch {
      return false;
    }
  }

  async logout(): Promise<void> {
    try {
      await this.axiosInstance.post("/user/logout", { domain: this.config.domain, token: this.config.token });
    } catch (error) {
      console.error("Logout error:", error);
    }
  }

  async installKonnectorFromTemplate(templateId: number): Promise<string | null> {
    const response = await this.axiosInstance.post<{
      message: string;
      connectorFolderId: string;
      connectors: {
        connectorId: string;
        connectorName: string;
      }[];
    }>(`/connector/template/install`, { templateId, token: this.config.token, domain: this.config.domain });
    return response.data.connectors[0].connectorId;
  }

  async listWorkflows(pageSize = 50, pageNumber = 1): Promise<Workflow[]> {
    const response = await this.axiosInstance.post<{
      data?: { list?: Record<string, unknown>[] };
      list?: Record<string, unknown>[];
    }>(`/connector/connectors?pageSize=${pageSize}&pageNumber=${pageNumber}`, {
      token: this.config.token,
      domain: this.config.domain,
    });

    const items = response.data?.data?.list || response.data?.list || [];

    return items.map((item) => ({
      id: String(item.id),
      name: String(item.name ?? ""),
      enabled: item.status === "ACTIVE",
      createdAt: String(item.createdAt ?? new Date().toISOString()),
      description: item.description ? String(item.description) : undefined,
      status: item.status as Workflow["status"],
      lastModified: item.updatedAt ? String(item.updatedAt) : undefined,
      lastRun: item.lastRunAt ? String(item.lastRunAt) : undefined,
      appId: item.appId ? String(item.appId) : undefined,
    }));
  }

  async activateWorkflow(workflowId: string): Promise<void> {
    await this.axiosInstance.post(`/connector/${workflowId}/activate`, {
      domain: this.config.domain,
      token: this.config.token,
    });
  }

  async deactivateWorkflow(workflowId: string): Promise<void> {
    await this.axiosInstance.post(`/connector/${workflowId}/deactivate`, {
      domain: this.config.domain,
      token: this.config.token,
    });
  }

  async listConnections(pageSize = 50, pageNumber = 1): Promise<Connection[]> {
    const response = await this.axiosInstance.post<{
      data?: { list?: Record<string, unknown>[] };
      list?: Record<string, unknown>[];
    }>(`/connector/connections?pageSize=${pageSize}&pageNumber=${pageNumber}`, {
      token: this.config.token,
      domain: this.config.domain,
    });

    const items = response.data?.data?.list || response.data?.list || [];

    return items.map((item) => ({
      id: String(item.id),
      appId: String(item.appId ?? ""),
      name: String(item.name ?? ""),
      data: (item.data as Record<string, unknown>) ?? {},
      status: item.status ? String(item.status) : "unknown",
      connectedUser: item.connectedUser
        ? String(item.connectedUser)
        : item.userEmail
        ? String(item.userEmail)
        : undefined,
      updatedAt: item.updatedAt ? String(item.updatedAt) : undefined,
      createdAt: item.createdAt ? String(item.createdAt) : undefined,
    }));
  }

  async createConnection(appId: string, name: string, data: Record<string, unknown>): Promise<Connection> {
    const response = await this.axiosInstance.post<Connection>("/connector/connection", {
      appId,
      name,
      data,
      token: this.config.token,
      domain: this.config.domain,
    });
    return response.data;
  }

  async updateConnection(
    connectionId: string,
    appId: string,
    name: string,
    data: Record<string, unknown>
  ): Promise<Connection> {
    const response = await this.axiosInstance.post<Connection>(`/connector/connection/${connectionId}/update`, {
      appId,
      name,
      data,
      token: this.config.token,
      domain: this.config.domain,
    });
    return response.data;
  }

  async editConnection(
    connectionId: string,
    appId: string,
    name: string,
    data: Record<string, unknown>
  ): Promise<Connection> {
    const response = await this.axiosInstance.post<Connection>(`/connector/connection/${connectionId}/edit`, {
      appId,
      name,
      data,
      token: this.config.token,
      domain: this.config.domain,
    });
    return response.data;
  }

  async deleteConnection(connectionId: string): Promise<void> {
    const response = await this.axiosInstance.post(`/connector/connection/${connectionId}/delete`, {
      token: this.config.token,
      domain: this.config.domain,
    });
  }

  async getOAuthAuthUrl(
    appId: string,
    connectionName: string,
    isEditing?: boolean,
    connectionId?: string
  ): Promise<{ authUrl: string; state: string }> {
    const authUrl = `https://${this.config.domain}${ROOT_DOMAIN}/ipaas/api/oauth/${appId}/auth-url`;
    const token = this.config.token;
    let body;

    if (connectionId && isEditing) {
      body = {
        connectionName: connectionName,
        id: connectionId,
        authUrl,
        token,
      };
    } else {
      body = {
        connectionName: connectionName,
        authUrl,
        token,
      };
    }
    console.log("monday body for fetching oauth url", body);
    const response = await this.axiosInstance.post<{
      data: {
        data: {
          authUrl: string;
          state: string;
        };
      };
    }>("/user/auth-url", body);
    return response.data.data.data;
  }

  async getBillingInfo2(): Promise<BillingSummary> {
    const response = await this.axiosInstance.post<{
      data: {
        billing: Billing;
        scheduled?: Record<string, unknown>;
        inTrial?: boolean;
        task?: TaskUsage;
        overAge?: { total: number | null; consumed: number | null };
      };
    }>("/user/billing/plans", {
      token: this.config.token,
      domain: this.config.domain,
    });

    const result = response.data.data;

    return {
      billing: result.billing,
      scheduled: result.scheduled,
      inTrial: result.inTrial ?? false,
      task: result.task, // will be undefined for now — that's fine, it's optional
      overAge: result.overAge,
    };
  }

  async getBillingCredits(): Promise<BillingCredits> {
    const response = await this.axiosInstance.post<{
      total: number;
      used: number;
      remaining: number;
      overageUsed: number;
      periodEnd: Date;
    }>("/user/billing/credits", {
      token: this.config.token,
      domain: this.config.domain,
    });

    return response.data;
  }

  async getBillingInfo(): Promise<BillingInfo> {
    const response = await this.axiosInstance.post<{
      inTrial?: boolean;
      billing?: {
        plan?: string;
        billingCycle?: string;
        subscriptionEnd?: string;
        trialEnd?: string;
        status?: string;
      };
      task?: Record<string, number>;
    }>("/user/billing/plans", {
      token: this.config.token,
      domain: this.config.domain,
    });
    const result = response.data;
    const date = result.inTrial === false ? result?.billing?.subscriptionEnd : result?.billing?.trialEnd;

    return {
      plan: result?.billing?.plan || "-",
      cycle: result?.billing?.billingCycle || "-",
      usage: result.task || {},
      renewalDate: this.formatDate(date),
      inTrial: result.inTrial || false,
      status: result?.billing?.status || "-",
    };
  }

  private formatDate(isoString?: string): string {
    if (!isoString) return "-";
    const date = new Date(isoString);
    const day = date.getDate();
    const month = date.toLocaleString("default", { month: "long" });
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  }

  handleError(context: string, error: unknown): never {
    const axiosError = error as AxiosError<{ message?: string }>;
    const errorMessage = axiosError.response?.data?.message || axiosError.message || "Unknown error";

    console.error(`${context} error:`, errorMessage);
    throw new Error(errorMessage);
  }
}

export function createClient(config: KonnectifyClientConfig): KonnectifyClient {
  return new KonnectifyClient(config);
}
