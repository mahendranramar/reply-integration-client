// export const ROOT_DOMAIN = ".prestaging.us.konnectify.dev"; // .prestaging.us.konnectify.dev | .stack5.us.konnectify.dev
// export const API_PATH = "/ipaas/api";
// export const UI_PATH = "/ipaas/ui";

// export const APP_IDS = {
//   monday: "mondaycrm-1.0.0",
//   Reply: "Reply-1.0.0",
// } as const;

// // export const WORKFLOW_TEMPLATE_IDS = [3] as const;
// // export const WORKFLOW_TEMPLATE_IDS = [4] as const;

// export const WORKFLOW_TEMPLATES = [
//   {
//     id: 4,
//     name: "Subscription Sync",
//     description:
//       "Syncs newly created subscription to Monday",
//   }
//   // {
//   //   id: 134,
//   //   name: "Account Sync",
//   //   description:
//   //     "Syncs newly created or modified accounts between Monday.com and Attio.",
//   // },
// ] as const;

// export const ACCOUNT_SETTINGS_SECTIONS = [
//   { id: "connections", label: "Connections" },
// ] as const;

// export const BOARD_VIEW_SECTIONS = [
//   { id: "overview", label: "Overview" },
//   { id: "workflows", label: "Workflows" },
//   { id: "logs", label: "Event Logs" },
// ] as const;

// export type AccountSettingsSection =
//   (typeof ACCOUNT_SETTINGS_SECTIONS)[number]["id"];
// export type BoardViewSection = (typeof BOARD_VIEW_SECTIONS)[number]["id"];

// =========================================================================================

export const ROOT_DOMAIN = ".prestaging.us.konnectify.dev"; // .prestaging.us.konnectify.dev | .stack5.us.konnectify.dev
export const API_PATH = "/ipaas/api";
export const UI_PATH = "/ipaas/ui";

export const APP_IDS = {
  monday: "mondaycrm-1.0.0",
  replyio: "replyio-1.0.0",
} as const;

// ─── Secondary app config ────────────────────────────────────────────────────
// Monday.com is the fixed primary app. SECONDARY_APP describes whichever app
// it's currently paired with (Reply today). This is the ONLY place you
// need to edit to swap it out for Hubspot/etc — SetupWizard.tsx and
// storageService.ts both import this instead of hardcoding "Reply".
//
// NOTE: swapping this alone does NOT swap the workflow template — see
// WORKFLOW_TEMPLATES below, its `id` points at a template folder whose
// actual contents ("Reply -> Monday contact sync") are app-specific.
// You'll need a new template id whenever the secondary app changes.
export const SECONDARY_APP = {
  // internal identifier — used as the Step id / discriminated union key in
  // SetupWizard.tsx, and as the storage key suffix in storageService.ts.
  key: "replyio",

  // the id connectionService/konnectifyClient use to identify this app
  appId: APP_IDS.replyio,

  // human-facing name, properly capitalized
  displayName: "Reply.io",

  // name sent to connectionService.create/edit
  connectionName: "Reply.io Connection",

  // wizard step indicator label
  stepLabel: "Connect Reply.io",

  // button copy
  connectButtonText: "Connect Reply.io",
  connectedButtonText: "Reply.io Connected",

  // SecondaryAppStep form copy
  panelSubtitle: "Enter your Reply.io API key to link your account",
  apiKeyHelpText: "Find your API key in Reply.io → Settings → API Settings",

  // TemplatesStep bullet copy
  templateDescription: "Reply.io ↔ Monday contacts",
} as const;

export const templateFolderId = 6 as const;
export const orgId = "48" as const;
export const projectId = "48" as const;

// export const WORKFLOW_TEMPLATE_IDS = [3] as const;
// export const WORKFLOW_TEMPLATE_IDS = [4] as const;

export const WORKFLOW_TEMPLATES = [
  {
    id: 4,
    name: "Add Monday Contact to Reply.io Sequence",
    description: "Automatically adds a new contact to a selected Reply sequence when an item is created in monday CRM.",
  },
  {
    id: 4,
    name: "Create Monday Contact on Email reply from Reply.io",
    description: "Automatically creates a new contact item in monday CRM when a contact replies to an email in Reply.",
  },
] as const;

export const ACCOUNT_SETTINGS_SECTIONS = [{ id: "connections", label: "Connections" }] as const;

export const BOARD_VIEW_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "workflows", label: "Workflows" },
  { id: "logs", label: "Event Logs" },
] as const;

export type AccountSettingsSection = (typeof ACCOUNT_SETTINGS_SECTIONS)[number]["id"];
export type BoardViewSection = (typeof BOARD_VIEW_SECTIONS)[number]["id"];
