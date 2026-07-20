import { APP_IDS, ROOT_DOMAIN, SECONDARY_APP, UI_PATH } from "../constants";
import type { IframeDestination } from "../types";

const UI_ROOT = `${ROOT_DOMAIN}${UI_PATH}`;

export class IframeService {
  buildBootstrapUrl(domain: string, destination: string, token?: string, extraParams?: Record<string, string>): string {
    const base = `https://${domain}${UI_ROOT}/bootstrap-page`;
    const params = new URLSearchParams();
    params.set("destination", destination);

    if (token) {
      params.set("bootstrap_token", token);
    }

    params.append("app", APP_IDS.monday);
    params.append("app", SECONDARY_APP.appId);

    if (extraParams) {
      Object.entries(extraParams).forEach(([key, value]) => {
        params.set(key, value);
      });
    }

    return `${base}?${params.toString()}`;
  }

  buildDestinationUrl(domain: string, config: IframeDestination, token?: string, workflowIds?: string[]): string {
    switch (config.type) {
      case "create":
        return this.buildBootstrapUrl(domain, "/konnectors/new", token);
      case "view":
      case "edit":
      case "preview":
        return this.buildBootstrapUrl(domain, `/konnectors/${config.workflowId}`, token);
      case "history": {
        const filters = {
          filters: [
            {
              logicalOperator: "AND",
              key: "konnectorId",
              operator: "in",
              value: workflowIds ?? (config.workflowId ? [config.workflowId] : []),
            },
          ],
        };
        return this.buildBootstrapUrl(domain, "/iframe-event-logs", token, {
          filters: btoa(JSON.stringify(filters)),
        });
      }
      default:
        return this.buildBootstrapUrl(domain, "/konnectors", token);
    }
  }

  buildConnectionOAuthUrl(authUrl: string): string {
    return authUrl;
  }
}

export const iframeService = new IframeService();
