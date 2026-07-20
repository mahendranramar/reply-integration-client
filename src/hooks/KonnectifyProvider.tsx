import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { authService } from "../services/authService";
import { billingService } from "../services/billingService";
import { connectionService } from "../services/connectionService";
import { KonnectifyClient } from "../services/konnectifyClient";
import { storageService } from "../services/storageService";
import { tenantService } from "../services/tenantService";
import { workflowService } from "../services/workflowService";
import type {
  AuthState,
  BillingInfo,
  Connection,
  DashboardMetrics,
  EventLog,
  SetupProgress,
  Tenant,
  Workflow,
  WorkflowTemplate,
} from "../types";

interface KonnectifyContextValue {
  client: KonnectifyClient | null;
  tenant: Tenant | null;
  auth: AuthState | null;
  loading: boolean;
  error: string | null;
  isConfigured: boolean;
  workflows: Workflow[];
  connections: Connection[];
  eventLogs: EventLog[];
  billing: BillingInfo | null;
  templates: WorkflowTemplate[];
  metrics: DashboardMetrics | null;
  setupProgress: SetupProgress;
  login: (domain: string, email: string, password: string) => Promise<void>;
  registerUser: (
    domain: string,
    email: string,
    password: string,
    name: string,
    website?: string,
    accountId?: string,
    appId?: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshWorkflows: () => Promise<void>;
  refreshConnections: () => Promise<void>;
  refreshBilling: () => Promise<void>;
  refreshDashboard: () => Promise<void>;
  refreshTemplates: () => Promise<void>;
  updateSetupProgress: (progress: Partial<SetupProgress>) => Promise<void>;
  ensureToken: () => Promise<string>;
  clearError: () => void;

}

const KonnectifyContext = createContext<KonnectifyContextValue | null>(null);

export function KonnectifyProvider({ children }: { children: React.ReactNode }) {
  const [client, setClient] = useState<KonnectifyClient | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [eventLogs, setEventLogs] = useState<EventLog[]>([]);
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [setupProgress, setSetupProgress] = useState<SetupProgress>({
    currentStep: 1,
    completedSteps: [],
    templatesInstalled: false,
  });

  const loadCachedData = useCallback(async () => {
    // restore config when page is refreshed after installing template
    const [cachedConnections, cachedTemplates, cachedSetup] =
    await Promise.all([
      connectionService.getCached(),
      workflowService.getTemplates(null),
      tenantService.getSetupProgress(),
    ]);
    setConnections(cachedConnections);
    setSetupProgress(cachedSetup);
    setTemplates(cachedTemplates);
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const session = await authService.loadSession();
        if (session.client && session.auth) {
          setClient(session.client);
          setAuth(session.auth);
          setTenant(await tenantService.getTenant());
        }
        await loadCachedData();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to initialize");
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, [loadCachedData]);

  const ensureToken = useCallback(async (): Promise<string> => {
    if (!client || !auth?.email) throw new Error("Authentication required");
    // Bootstrap tokens expire in 120 s — always mint a fresh one.
    const password = await storageService.getSessionPassword();
    if (!password) throw new Error("Session expired — please log in again");
    return client.getBootstrapToken(auth.email, password);
  }, [client, auth]);

  const refreshWorkflows = useCallback(async () => {
    if (!client) return;
    const list = await workflowService.list(client);
    setWorkflows(list);
  }, [client]);

  const refreshConnections = useCallback(async () => {
    if (!client) return;
    const list = await connectionService.list(client);
    setConnections(list);
  }, [client]);

  const refreshBilling = useCallback(async () => {
    if (!client) return;
    const info = await billingService.fetchBilling(client);
    setBilling(info);
  }, [client]);

  const refreshTemplates = useCallback(async () => {
    const list = await workflowService.getTemplates(client);
    setTemplates(list);
  }, [client]);

  const refreshDashboard = useCallback(async () => {
    if (client) {
      await Promise.all([
        refreshWorkflows(),
        refreshConnections(),
        refreshBilling(),
        refreshTemplates(),
      ]);
    }

    const currentWorkflows = client
      ? await workflowService.list(client).catch(() => workflows)
      : [];
      
    const currentConnections = client
      ? await connectionService.list(client).catch(() => connections)
      : connections;

    setWorkflows(currentWorkflows);
    setConnections(currentConnections);
  
  }, [client, workflows, connections, billing, refreshWorkflows, refreshConnections, refreshBilling, refreshTemplates]);

  const login = useCallback(
    async (domain: string, email: string, password: string) => {
      setLoading(true);
      setError(null);
      try {
        
        const result = await authService.login(domain, email, password);
        sessionStorage.setItem("konnectify_session_password", password);
        setClient(result.client);
        setAuth(result.auth);
        setTenant(await tenantService.getTenant());
        await tenantService.markStepComplete(1);
        await refreshConnections();
        const progress = await tenantService.getSetupProgress();
        setSetupProgress(progress);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Login failed");
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [refreshConnections],
  );

  const registerUser = useCallback(
    async (
      domain: string,
      email: string,
      password: string,
      name: string,
      website?: string,
      accountId?: string,
      appId?: string
    ) => {
      setError(null);
      try {
        const result = await authService.registerUser(
          domain,
          email,
          password,
          name,
          website,
          accountId,
          appId
        );
        sessionStorage.setItem("konnectify_session_password", password);
        setClient(result.client);
        setAuth(result.auth);
        setTenant(await tenantService.getTenant());
        await tenantService.markStepComplete(1);
        await refreshConnections();
        const progress = await tenantService.getSetupProgress();
        setSetupProgress(progress);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Registration failed");
        throw err;
      } 
    },
    [refreshConnections],
  );

  const logout = useCallback(async () => {
  await authService.logout(client); 
  sessionStorage.removeItem("konnectify_session_password");
  setClient(null);
  setTenant(null);
  setAuth(null);
  setConnections([]);
  setWorkflows([]);
  setEventLogs([]);
  setTemplates([]);
  setBilling(null);
  setSetupProgress({
    currentStep: 1,
    completedSteps: [],
    templatesInstalled: false,
  });
}, [client]);


  const updateSetupProgress = useCallback(async (progress: Partial<SetupProgress>) => {
    const updated = await tenantService.updateSetupProgress(progress);
    setSetupProgress(updated);
  }, []);

  const value = useMemo(
    () => ({
      client,
      tenant,
      auth,
      loading,
      error,
      isConfigured: !!client && !!tenant && !!auth,
      workflows,
      connections,
      eventLogs,
      billing,
      templates,
      metrics,
      setupProgress,
      login,
      registerUser,
      logout,
      refreshWorkflows,
      refreshConnections,
      refreshBilling,
      refreshDashboard,
      refreshTemplates,
      updateSetupProgress,
      ensureToken,
      clearError: () => setError(null),
    }),
    [
      client,
      tenant,
      auth,
      loading,
      error,
      workflows,
      connections,
      eventLogs,
      billing,
      templates,
      metrics,
      setupProgress,
      login,
      registerUser, 
      logout,
      refreshWorkflows,
      refreshConnections,
      refreshBilling,
      refreshDashboard,
      refreshTemplates,
      updateSetupProgress,
      ensureToken,
    ],
  );

  return (
    <KonnectifyContext.Provider value={value}>{children}</KonnectifyContext.Provider>
  );
}

export function useKonnectify(): KonnectifyContextValue {
  const context = useContext(KonnectifyContext);
  if (!context) {
    throw new Error("useKonnectify must be used within KonnectifyProvider");
  }
  return context;
}
