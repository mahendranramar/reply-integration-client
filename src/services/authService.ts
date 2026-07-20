import { KonnectifyClient } from "./konnectifyClient";
import { storageService } from "./storageService";
import type { AuthState } from "../types";
import {orgId, projectId} from "../constants/index"

export class AuthService {
  constructor(private storage = storageService) {}

  async registerUser(
    domain: string,
    email: string,
    password: string,
    name: string,
    website?: string,
    accountId?:string,
    appId?: string
  ): Promise<{ client: KonnectifyClient; auth: AuthState }> {
    const tempClient = new KonnectifyClient({ domain });

    try {
      // Register — returns the long-lived service accessToken for API calls.
      const serviceAuth = await tempClient.registerUser(email, password, name, orgId, projectId, website, accountId, appId);
      
      await this.storage.setTenant({ domain, orgId, projectId, email, password, website, name });
      await this.storage.setAuth(serviceAuth);
      // Persist password so ensureToken can mint fresh bootstrap tokens on demand.
      await this.storage.setSessionPassword(password);

      const client = new KonnectifyClient({ domain, token: serviceAuth.accessToken });
      return { client, auth: serviceAuth };
    } catch (error) {
      
      return tempClient.handleError("register", error);
    }
  }

  async login(
    domain: string,
    email: string,
    password: string,
  ): Promise<{ client: KonnectifyClient; auth: AuthState }> {
    const orgId = "4";
    const projectId = "4";
    const tempClient = new KonnectifyClient({ domain });

    try {
      // Login — returns the long-lived service accessToken for API calls.
      const serviceAuth = await tempClient.login(email, password, orgId);

      await this.storage.setTenant({ domain, orgId, projectId });
      await this.storage.setAuth(serviceAuth);
      // Persist password so ensureToken can mint fresh bootstrap tokens on demand.
      await this.storage.setSessionPassword(password);

      const client = new KonnectifyClient({ domain, token: serviceAuth.accessToken });
      return { client, auth: serviceAuth };
    } catch (error) {
      return tempClient.handleError("login", error);
    }
  }

  async logout(client: KonnectifyClient | null): Promise<void> {
    if (client) {
      await client.logout();
    }
    await this.storage.clear();
  }

  async loadSession(): Promise<{
    client: KonnectifyClient | null;
    auth: AuthState | null;
  }> {
    const tenant = await this.storage.getTenant();
    const auth = await this.storage.getAuth();

    if (!tenant || !auth?.accessToken) {
      return { client: null, auth: null };
    }

    const client = new KonnectifyClient({
      domain: tenant.domain,
      token: auth.accessToken,
    });

    return { client, auth };
  }
}

export const authService = new AuthService();
