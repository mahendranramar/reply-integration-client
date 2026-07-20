export interface Tenant {
  domain: string;
  orgId: string;
  projectId: string;
  name?: string;
  website?: string;
  password?: string;
  email?: string;
}

export interface AuthState {
  /** Long-lived service token — used for all API calls (connections, konnectors, etc.) */
  accessToken: string;
  email?: string;
}

export interface SetupProgress {
  currentStep: number;
  completedSteps: number[];
  mondayConnectionId?: string;
  attioConnectionId?: string;
  templatesInstalled: boolean;
}

export interface Workflow {
  id: string;
  name: string;
  enabled: boolean;
  createdAt: string;
  description?: string;
  status?: "ACTIVE" | "INACTIVE" | "DRAFT";
  lastModified?: string;
  lastRun?: string;
  appId?: string;
}

export interface EventLog {
  id: string;
  timestamp: string;
  type: "EXECUTION" | "ERROR" | "CONNECTION" | "SYNC";
  status: "SUCCESS" | "FAILED" | "PENDING" | "WARNING";
  message: string;
  workflowId: string;
  details?: Record<string, unknown>;
}

export interface Connection {
  id: string;
  appId: string;
  name: string;
  data: Record<string, unknown>;
  status?: string;
  connectedUser?: string;
  updatedAt?: string;
  createdAt?: string;
}

export interface BillingInfo {
  plan: string;
  cycle: string;
  usage: Record<string, number>;
  renewalDate: string;
  inTrial: boolean;
  status: string;
}

export interface KonnectifyBilling {
  // customerId: string;
  plan: string;
  billingCycle: string;
  status: string;
  trialEnd: string | null;
  subscriptionEnd: string | null;
  inTrial: boolean;
  task: {
    total: number;
    consumed: number;
  };
}

export interface SubscriptionInfo {
  plan: string;
  status: string;
  renewalDate: string;
  billingCycle: string;
  inTrial: boolean;
}


export interface WorkflowTemplate {
  id: number;
  name: string;
  description: string;
  installed?: boolean;
  konnectorId?: string;
}

export interface DashboardMetrics {
  tenantStatus: "active" | "trial" | "inactive" | "unknown";
  plan: string;
  connectionCount: number;
  activeWorkflows: number;
  totalWorkflows: number;
  executionsToday: number;
  failedExecutions: number;
  lastUpdated: string;
}

export interface ApiResponse<T = unknown> {
  status?: number;
  data?: T;
  message?: string;
  error?: boolean;
}

export interface KonnectorResponse {
  konnectorId: string;
  name: string;
  status: string;
  createdAt: string;
}

export interface ListKonnectorsResponse {
  list: Workflow[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
}

export interface IframeDestination {
  type: "view" | "edit" | "create" | "history" | "preview";
  workflowId?: string;
  templateId?: number;
}

export interface SecondaryAppCredentials {
  api_key: string;
}

export interface BillingSummary {
  billing: Billing;
  scheduled?: Record<string, unknown>;
  task?: TaskUsage;
  overAge?: { total: number | null; consumed: number | null };
  inTrial?: boolean;
}

export interface Billing {
  id: string;
  scope: string;
  customerId: string;
  subscriptionId: string;
  productId: string;
  planId: string;
  trialEnd: string | null;
  subscriptionEnd: string | null;
  status: "trialing" | "active" | "past_due" | "canceled" | string;
  hasAddon: boolean;
  freezeAccount: boolean;
  createdAt: string;
  updatedAt: string;
  orgId: string;
  projectId: string;
  tenantId: string;
  plan: string;
  billingCycle: "month" | "year" | string;
  balance: number;
  priceId: string;
  hasCard: boolean;
  currentCreditBillingCycleId?: string;
}

export interface TaskUsage {
  total: number;
  consumed: number;
}

export interface BillingCredits {
  total: number;
  used: number;
  remaining: number;
  overageUsed: number;
  periodEnd: Date
}

