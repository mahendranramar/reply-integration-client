import React, { useEffect, useState, useRef } from "react";
import { Button, Loader, Text } from "@vibe/core";
import { Check, Email, Globe, Hide, Locked, Person, Show, Warning } from "@vibe/icons";
import { useKonnectify } from "../../hooks";
import { APP_IDS, SECONDARY_APP, templateFolderId, WORKFLOW_TEMPLATES } from "../../constants";
import { connectionService } from "../../services/connectionService";
import { storageService } from "../../services/storageService";
import styles from "./SetupWizard.module.css";
import axios from "axios";
import mondaySdk from "monday-sdk-js";
import type { SecondaryAppCredentials } from "../../types";
const monday = mondaySdk();

// SECONDARY_APP (the app paired with Monday — currently Reply.io) now lives
// in ../../constants.ts. That's the ONLY place to edit to swap the secondary
// app, since storageService.ts also needs it (a service can't import from a
// component file, so the shared config has to live in constants).

// ─── Step types ──────────────────────────────────────────────────────────────

type Step = "auth" | "monday" | typeof SECONDARY_APP.key | "templates";

const STEPS: Array<{ id: Step; label: string }> = [
  { id: "auth", label: "Sign Up" },
  { id: "monday", label: "Connect Monday" },
  { id: SECONDARY_APP.key, label: SECONDARY_APP.stepLabel },
  { id: "templates", label: "Install Templates" },
];

// ─── SetupWizard ─────────────────────────────────────────────────────────────

const STEP_NUMBER_TO_ID: Record<number, Step> = {
  1: "auth",
  2: "monday",
  3: SECONDARY_APP.key,
  4: "templates",
};

export const SetupWizard: React.FC = () => {
  const {
    client,
    //  login,
    registerUser,
    isConfigured,
    loading: contextLoading,
    updateSetupProgress,
    refreshConnections,
    setupProgress,
    connections,
  } = useKonnectify();
  // client is used in step handlers (handleMondayConnect, handleSecondaryAppConnect)

  const [currentStep, setCurrentStep] = useState<Step>("auth");
  // Tracks the furthest step the user has actually unlocked/reached.
  // Kept separate from `currentStep` (which is just "what's on screen right
  // now") so that navigating BACK to review an earlier step doesn't lock you
  // out of steps you'd already reached.
  const [furthestStep, setFurthestStep] = useState<Step>("auth");
  const [completed, setCompleted] = useState<Set<Step>>(new Set<Step>());
  const [initialized, setInitialized] = useState(false);
  const [errors, setErrors] = useState<Record<Step, string>>({
    auth: "",
    monday: "",
    [SECONDARY_APP.key]: "",
    templates: "",
  });
  const [submitting, setSubmitting] = useState(false);
  // new change for preventing field values
  const [authForm, setAuthForm] = useState({
    domain: "",
    email: "",
    password: "",
    name: "",
    website: "",
    accountId: "",
    appId: "",
  });
  const [mondayApiToken, setMondayApiToken] = useState("");
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [secondaryAppCredentials, setSecondaryAppCredentials] = useState<SecondaryAppCredentials>({ api_key: "" });

  const prefillSecondaryAppCredentials = async () => {
    const fsCredentials = (await storageService.getSecondaryAppCredentials()) as
      | (SecondaryAppCredentials & { apikey?: string })
      | null;
    if (fsCredentials) {
      setSecondaryAppCredentials({ api_key: fsCredentials.api_key ?? fsCredentials.apikey ?? "" });
    }
  };

  const oauthWindowRef = useRef<Window | null>(null);
  const wasConfiguredRef = useRef(isConfigured);
  const [isMondayConnected, setIsMondayConnected] = useState(false);
  const [isSecondaryAppConnected, setIsSecondaryAppConnected] = useState(false);

  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      if (event.data?.type !== "oauth-success") return;
      if (oauthWindowRef.current && !oauthWindowRef.current.closed) {
        oauthWindowRef.current.close();
      }
      oauthWindowRef.current = null; // marks this as the success path for the poller

      try {
        await refreshConnections();

        const newCompleted = Array.from(new Set([...(setupProgress.completedSteps ?? []), 2]));

        await updateSetupProgress({
          currentStep: 3,
          completedSteps: newCompleted,
        });

        setIsMondayConnected(true);
        advance("monday");
      } finally {
        setSubmitting(false); // only now, once the step has actually advanced
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [refreshConnections, setupProgress, updateSetupProgress]);

  // Reset the wizard whenever the user logs out. `isConfigured` flips from
  // true -> false in KonnectifyProvider.logout(), but that only clears
  // context state — none of SetupWizard's own local state (currentStep,
  // completed, furthestStep, forms, etc). Without this, `initialized` stays
  // true forever (it's only ever set once, in loadContext), so the
  // restore-position effect never runs again and the wizard stays stuck on
  // whatever step/screen it was on when logout was clicked.
  useEffect(() => {
    if (wasConfiguredRef.current && !isConfigured) {
      setCurrentStep("auth");
      setFurthestStep("auth");
      setCompleted(new Set<Step>());
      setErrors({ auth: "", monday: "", [SECONDARY_APP.key]: "", templates: "" });
      setAuthForm({
        domain: "",
        email: "",
        password: "",
        name: "",
        website: "",
        accountId: "",
        appId: "",
      });
      setMondayApiToken("");
      setRegistrationComplete(false);
      setSecondaryAppCredentials({ api_key: "" });
      setIsMondayConnected(false);
      setIsSecondaryAppConnected(false);
      setSubmitting(false);
      // Flip this back so the restore-on-load effect runs again and
      // re-derives step/completed from the now-empty setupProgress, and
      // re-fetches accountId/appId via loadContext().
      setInitialized(false);
    }
    wasConfiguredRef.current = isConfigured;
  }, [isConfigured]);

  const loadContext = async () => {
    const context = (await monday.get("context")).data;
    const accountId = context.account.id;
    const appId = context.app.id;
    setAuthForm((prev) => ({ ...prev, accountId, appId: appId.toString() }));
    setInitialized(true);
  };

  const prefillFields = async () => {
    let tenant: any = await storageService.getTenant();

    const restoredCompleted = new Set<Step>(
      setupProgress.completedSteps.map((n) => STEP_NUMBER_TO_ID[n]).filter(Boolean) as Step[]
    );
    if (restoredCompleted.size && restoredCompleted.size == 1) {
      setAuthForm({
        domain: tenant?.domain || "",
        email: tenant?.email || "",
        password: tenant?.password || "",
        name: tenant?.name || "",
        website: tenant?.website || "",
        accountId: "",
        appId: "",
      });
      setRegistrationComplete(true);
    } else if (restoredCompleted.size && restoredCompleted.size == 2) {
      setRegistrationComplete(true);
      setIsMondayConnected(true);
    } else if (restoredCompleted.size && restoredCompleted.size == 3) {
      setRegistrationComplete(true);
      setIsMondayConnected(true);
      setIsSecondaryAppConnected(true);
    }
  };

  // Restore wizard position from persisted setupProgress once context has loaded.
  useEffect(() => {
    if (contextLoading || initialized) return;
    prefillSecondaryAppCredentials();

    const restoredCompleted = new Set<Step>(
      setupProgress.completedSteps.map((n) => STEP_NUMBER_TO_ID[n]).filter(Boolean) as Step[]
    );
    prefillFields();

    // If the user is already authenticated (session survived reload), mark auth done.
    if (isConfigured && !restoredCompleted.has("auth")) {
      restoredCompleted.add("auth");
    }

    setCompleted(restoredCompleted);

    // Jump to the furthest incomplete step.
    const orderedSteps: Step[] = ["auth", "monday", SECONDARY_APP.key, "templates"];
    const firstIncomplete = orderedSteps.find((s) => !restoredCompleted.has(s));
    const resolvedStep = firstIncomplete ?? "templates";
    setCurrentStep(resolvedStep);
    // Furthest reached also starts here — everything up to this point is
    // already unlocked via `completed`, so this is the new high-water mark.
    setFurthestStep(resolvedStep);

    loadContext();
  }, [contextLoading, initialized, setupProgress, isConfigured]);

  const markError = (step: Step, msg: string) => setErrors((prev) => ({ ...prev, [step]: msg }));
  const clearError = (step: Step) => setErrors((prev) => ({ ...prev, [step]: "" }));

  const advance = (from: Step) => {
    setCompleted((prev) => new Set([...prev, from]));
    const idx = STEPS.findIndex((s) => s.id === from);
    if (idx < STEPS.length - 1) {
      const next = STEPS[idx + 1].id;
      setCurrentStep(next);
      // Only move `furthestStep` forward, never backward.
      setFurthestStep((prevFurthest) => {
        const nextIdx = STEPS.findIndex((s) => s.id === next);
        const prevFurthestIdx = STEPS.findIndex((s) => s.id === prevFurthest);
        return nextIdx > prevFurthestIdx ? next : prevFurthest;
      });
    }
  };

  const currentIndex = STEPS.findIndex((s) => s.id === currentStep);
  const furthestIndex = STEPS.findIndex((s) => s.id === furthestStep);
  const isComplete = completed.has("templates") || setupProgress.templatesInstalled;

  if (contextLoading || !initialized) {
    return (
      <div className={styles.stepContent} style={{ display: "flex", justifyContent: "center", padding: 48 }}>
        <Loader size="medium" />
      </div>
    );
  }

  if (isComplete) {
    return (
      <div className={styles.stepContent}>
        <CompleteStep />
      </div>
    );
  }

  return (
    <div className={styles.wizardContainer}>
      {/* ── Step indicator ───────────────────────────────────────────────── */}
      <div className={styles.stepIndicator}>
        <div className={styles.stepsWrapper}>
          {STEPS.map((step, index) => (
            <React.Fragment key={step.id}>
              <button
                className={[
                  styles.stepButton,
                  currentStep === step.id ? styles.stepButtonActive : "",
                  completed.has(step.id) ? styles.stepButtonCompleted : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => {
                  if (index <= furthestIndex || completed.has(step.id)) {
                    setCurrentStep(step.id);
                  }
                }}
                disabled={index > furthestIndex && !completed.has(step.id)}
              >
                <div className={styles.stepCircle}>
                  {completed.has(step.id) ? <Check size={16} /> : <span>{index + 1}</span>}
                </div>
                <span className={styles.stepLabel}>{step.label}</span>
              </button>
              {index < STEPS.length - 1 && (
                <div
                  className={[styles.stepDivider, index < currentIndex ? styles.stepDividerCompleted : ""]
                    .filter(Boolean)
                    .join(" ")}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ── Step content ─────────────────────────────────────────────────── */}
      <div className={styles.stepContent}>
        {currentStep === "auth" && (
          <AuthStep
            form={authForm}
            setForm={setAuthForm}
            registrationComplete={registrationComplete}
            onSubmit={handleAuth}
            submitting={submitting}
            error={errors.auth}
          />
        )}
        {currentStep === "monday" && (
          <MondayStep
            onConnect={handleMondayConnect}
            submitting={submitting}
            error={errors.monday}
            mondayApiToken={mondayApiToken}
            setMondayApiToken={setMondayApiToken}
            isMondayConnected={isMondayConnected}
          />
        )}
        {currentStep === SECONDARY_APP.key && (
          <SecondaryAppStep
            onConnect={handleSecondaryAppConnect}
            submitting={submitting}
            error={errors[SECONDARY_APP.key]}
            credentials={secondaryAppCredentials}
            setCredentials={setSecondaryAppCredentials}
            isConnected={isSecondaryAppConnected}
          />
        )}
        {currentStep === "templates" && (
          <TemplatesStep onInstall={handleInstallTemplates} submitting={submitting} error={errors.templates} />
        )}
      </div>
    </div>
  );

  // ── Step 1: Auth ────────────────────────────────────────────────────────────
  async function handleAuth(
    domain: string,
    email: string,
    password: string,
    isLogin: boolean,
    name?: string,
    website?: string,
    accountId?: string,
    appId?: string
  ) {
    clearError("auth");
    setSubmitting(true);
    try {
      await registerUser(domain, email, password, name ?? "", website, accountId, appId);
      setRegistrationComplete(true);
      advance("auth");
    } catch (err) {
      markError("auth", err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Step 2: Monday ──────────────────────────────────────────────────────────
  async function handleMondayConnect() {
    const isEditingConnection = false;
    clearError("monday");
    setSubmitting(true);
    try {
      if (!client) throw new Error("Client not initialised");
      const oauthUrlResponse = await connectionService.getOAuthUrl(
        client,
        APP_IDS.monday,
        "Monday Connection",
        isEditingConnection
      );
      const win = window.open(oauthUrlResponse.authUrl, "_blank", "width=600,height=700");
      if (!win) {
        throw new Error("Popup was blocked — please allow popups and try again");
      }
      oauthWindowRef.current = win;
      // NOTE: submitting stays true here on purpose — the message-event effect
      // below is responsible for flipping it off once the OAuth round-trip
      // (postMessage -> refreshConnections -> updateSetupProgress -> advance)
      // actually finishes. Also start polling in case the user just closes
      // the popup instead of completing auth, so we don't spin forever.
      pollForManualClose(win);
    } catch (err) {
      markError("monday", err instanceof Error ? err.message : "Failed to connect Monday");
      setSubmitting(false);
    }
  }

  function pollForManualClose(win: Window) {
    const interval = setInterval(() => {
      if (win.closed) {
        clearInterval(interval);
        // If the window closed but we never got oauth-success, oauthWindowRef
        // will still be set to this window — that's our signal it wasn't
        // the success path (the message handler nulls it out on success).
        if (oauthWindowRef.current === win) {
          oauthWindowRef.current = null;
          setSubmitting(false);
        }
      }
    }, 500);
  }

  // ── Step 3: Secondary app (currently Reply.io) ──────────────────────────────
  async function handleSecondaryAppConnect(apiKey: string) {
    const secondaryAppConnection = connections?.find((c) => c.appId === SECONDARY_APP.appId) ?? null;
    clearError(SECONDARY_APP.key);
    setSubmitting(true);
    try {
      if (!client) throw new Error("Client not initialised");
      const connectionData = {
        api_key: apiKey,
      };
      if (secondaryAppConnection) {
        // edit connection flow
        const connectionId: string = secondaryAppConnection.id;
        await connectionService.edit(
          client,
          connectionId,
          SECONDARY_APP.appId,
          SECONDARY_APP.connectionName,
          connectionData
        );
      } else {
        // create connection flow
        await connectionService.create(client, SECONDARY_APP.appId, SECONDARY_APP.connectionName, connectionData);
      }
      setIsSecondaryAppConnected(true);
      await refreshConnections();
      const newCompleted = Array.from(new Set([...(setupProgress.completedSteps ?? []), 3]));
      await updateSetupProgress({ currentStep: 4, completedSteps: newCompleted });
      const credentialsToStore = {
        api_key: apiKey,
      };
      await storageService.setSecondaryAppCredentials(credentialsToStore);
      advance(SECONDARY_APP.key);
    } catch (err) {
      markError(
        SECONDARY_APP.key,
        err instanceof Error ? err.message : `Failed to connect ${SECONDARY_APP.displayName}`
      );
    } finally {
      setSubmitting(false);
    }
  }

  // ── Step 4: Templates ───────────────────────────────────────────────────────
  async function handleInstallTemplates() {
    clearError("templates");
    setSubmitting(true);
    try {
      if (!client) throw new Error("Client not initialised");
      if (!templateFolderId) throw new Error("Template folder is unavailable");
      await Promise.all([
        client.installKonnectorFromTemplate(templateFolderId), // template folder id
      ]);
      const newCompleted = Array.from(new Set([...(setupProgress.completedSteps ?? []), 4]));
      await updateSetupProgress({ currentStep: 4, completedSteps: newCompleted, templatesInstalled: true });
      advance("templates");
    } catch (err) {
      markError("templates", err instanceof Error ? err.message : "Failed to install templates");
    } finally {
      setSubmitting(false);
    }
  }
};

// ─── AuthStep ────────────────────────────────────────────────────────────────

interface AuthStepProps {
  onSubmit: (
    domain: string,
    email: string,
    password: string,
    isLogin: boolean,
    name?: string,
    website?: string,
    accountId?: string,
    appId?: string
  ) => Promise<void>;
  submitting: boolean;
  error: string;
  form: AuthForm;
  setForm: React.Dispatch<React.SetStateAction<AuthForm>>;
  registrationComplete: boolean;
}

interface AuthForm {
  domain: string;
  email: string;
  password: string;
  name: string;
  website: string;
  accountId: string;
  appId: string;
}

const AuthStep: React.FC<AuthStepProps> = ({ onSubmit, submitting, error, form, setForm, registrationComplete }) => {
  const [isLogin, setIsLogin] = useState(false);
  const [localError, setLocalError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const validate = () => {
    if (!form.domain.trim()) return "Domain is required";
    if (!/^[a-z0-9-]+$/.test(form.domain)) return "Domain must be lowercase letters, numbers and hyphens only";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "Invalid email address";
    if (form.password.length < 8) return "Password must be at least 8 characters";
    if (!isLogin && !form.name.trim()) return "Name is required";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");
    const validationError = validate();
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    await onSubmit(
      form.domain,
      form.email,
      form.password,
      isLogin,
      form.name,
      form.website,
      form.accountId,
      form.appId
    );
  };

  const displayError = localError || error;

  return (
    <div className={styles.stepPanel}>
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>{isLogin ? "Welcome Back" : "Create Account"}</h2>
        <p className={styles.panelSubtitle}>
          {isLogin ? "Sign in to your Konnectify workspace" : "Set up your Konnectify workspace"}
        </p>
      </div>

      {displayError && (
        <div className={styles.errorAlert}>
          <Warning size={16} />
          <span>{displayError}</span>
        </div>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className={styles.form}>
        {/* domain field */}
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Konnectify Domain</label>
          <div className={styles.inputWrapper}>
            <Globe size={18} />
            <input
              type="text"
              placeholder="your-domain"
              value={form.domain}
              onChange={(e) => setForm((prev) => ({ ...prev, domain: e.target.value }))}
              disabled={submitting || registrationComplete}
            />
            <span className={styles.domainSuffix}>.konnectifyapp.co</span>
          </div>
        </div>

        {/* email field */}
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Email Address</label>
          <div className={styles.inputWrapper}>
            <Email size={18} />
            <input
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              disabled={submitting || registrationComplete}
            />
          </div>
        </div>

        {/* password field */}
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Password</label>
          <div className={styles.inputWrapper}>
            <Locked size={18} />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              disabled={submitting || registrationComplete}
            />
            <button
              type="button"
              className={styles.passwordToggle}
              onClick={() => setShowPassword((prev) => !prev)}
              disabled={submitting || registrationComplete}
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <Hide size={18} /> : <Show size={18} />}
            </button>
          </div>
        </div>

        {!isLogin && (
          <>
            {/* name field */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Full Name</label>
              <div className={styles.inputWrapper}>
                <Person size={18} />
                <input
                  type="text"
                  placeholder="John Doe"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  disabled={submitting || registrationComplete}
                />
              </div>
            </div>

            {/* website field */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                Company Website <span className={styles.optional}>(optional)</span>
              </label>
              <div className={styles.inputWrapper}>
                <Globe size={18} />
                <input
                  type="url"
                  placeholder="https://example.com"
                  value={form.website}
                  onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))}
                  disabled={submitting || registrationComplete}
                />
              </div>
            </div>
          </>
        )}

        <Button
          kind="primary"
          type="submit"
          loading={submitting}
          disabled={submitting || registrationComplete}
          style={{ width: "100%", marginTop: 8 }}
        >
          {registrationComplete ? "Account Created" : "Create Account"}
        </Button>
      </form>
    </div>
  );
};

// ─── MondayStep ──────────────────────────────────────────────────────────────

interface MondayStepProps {
  onConnect: () => Promise<void>;
  submitting: boolean;
  error: string;
  mondayApiToken: string;
  setMondayApiToken: React.Dispatch<React.SetStateAction<string>>;
  isMondayConnected: boolean;
}

const MondayStep: React.FC<MondayStepProps> = ({ onConnect, submitting, error, isMondayConnected }) => {
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConnect();
  };

  return (
    <div className={styles.stepPanel}>
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>Connect Monday</h2>
        <p className={styles.panelSubtitle}>Click on Connect Monday button to link your account</p>
      </div>

      {error && (
        <div className={styles.errorAlert}>
          <Warning size={16} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className={styles.form}>
        <Button
          kind="primary"
          type="submit"
          loading={submitting}
          disabled={submitting || isMondayConnected}
          style={{ width: "100%", marginTop: 8 }}
        >
          {isMondayConnected ? "Connected with Monday" : "Connect Monday"}
        </Button>
      </form>
    </div>
  );
};

// ─── SecondaryAppStep ────────────────────────────────────────────────────────
// Generic step for whatever SECONDARY_APP is currently configured (Reply.io
// today). All copy/labels come from SECONDARY_APP — nothing app-specific
// is hardcoded here.

interface SecondaryAppStepProps {
  onConnect: (apiKey: string) => Promise<void>;
  submitting: boolean;
  error: string;
  credentials: SecondaryAppCredentials;
  setCredentials: React.Dispatch<React.SetStateAction<SecondaryAppCredentials>>;
  isConnected: boolean;
}

const SecondaryAppStep: React.FC<SecondaryAppStepProps> = ({
  onConnect,
  submitting,
  error,
  credentials,
  setCredentials,
  isConnected,
}) => {
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConnect(credentials.api_key.trim());
  };

  return (
    <div className={styles.stepPanel}>
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>Connect {SECONDARY_APP.displayName}</h2>
        <p className={styles.panelSubtitle}>{SECONDARY_APP.panelSubtitle}</p>
      </div>

      {error && (
        <div className={styles.errorAlert}>
          <Warning size={16} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className={styles.form}>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>API Key</label>
          <div className={styles.inputWrapper}>
            <Locked size={18} />
            <input
              type="password"
              placeholder="Paste your API key here..."
              value={credentials.api_key}
              onChange={(e) => setCredentials((prev) => ({ ...prev, api_key: e.target.value }))}
              disabled={submitting || isConnected}
            />
          </div>
          <Text type="text3" color="secondary" style={{ marginTop: 4 }}>
            {SECONDARY_APP.apiKeyHelpText}
          </Text>
        </div>

        <Button
          kind="primary"
          type="submit"
          loading={submitting}
          disabled={submitting || !credentials.api_key.trim() || isConnected}
          style={{ width: "100%", marginTop: 8 }}
        >
          {isConnected ? SECONDARY_APP.connectedButtonText : SECONDARY_APP.connectButtonText}
        </Button>
      </form>
    </div>
  );
};

// ─── TemplatesStep ───────────────────────────────────────────────────────────

interface TemplatesStepProps {
  onInstall: () => Promise<void>;
  submitting: boolean;
  error: string;
}

const TemplatesStep: React.FC<TemplatesStepProps> = ({ onInstall, submitting, error }) => (
  <div className={styles.stepPanel}>
    <div className={styles.panelHeader}>
      <h2 className={styles.panelTitle}>Install Workflow Templates</h2>
      <p className={styles.panelSubtitle}>Pre-built workflows to get you started instantly</p>
    </div>

    {error && (
      <div className={styles.errorAlert}>
        <Warning size={16} />
        <span>{error}</span>
      </div>
    )}

    <div className={styles.form}>
      <div className={styles.templateInfo}>
        <div className={styles.infoIcon}>
          <Check size={20} />
        </div>
        <div>
          <p className={styles.infoTitle}>Ready to Install</p>
          <p className={styles.infoText}>{WORKFLOW_TEMPLATES.length} workflow templates will be installed:</p>
        </div>
      </div>

      <div className={styles.templateCards}>
        {WORKFLOW_TEMPLATES.map((template) => (
          <div className={styles.templateCard} key={`${template.id}-${template.name}`}>
            <p className={styles.templateCardTitle}>{template.name}</p>
            <p className={styles.templateCardDescription}>{template.description}</p>
          </div>
        ))}
      </div>

      <Button
        kind="primary"
        onClick={() => void onInstall()}
        loading={submitting}
        disabled={submitting}
        style={{ width: "100%", marginTop: 8 }}
      >
        Install Templates
      </Button>
    </div>
  </div>
);

// ─── CompleteStep ────────────────────────────────────────────────────────────

const CompleteStep: React.FC = () => {
  const { client, tenant, auth, connections, refreshConnections, logout } = useKonnectify();
  const mondayConn = connections.find((c) => c.appId === APP_IDS.monday) ?? null;
  const secondaryAppConn = connections.find((c) => c.appId === SECONDARY_APP.appId) ?? null;

  const editOauthWindowRef = useRef<Window | null>(null);
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    // for edit oauth
    const handler = async (event: MessageEvent) => {
      if (event.data?.type !== "oauth-success") return;
      if (editOauthWindowRef.current && !editOauthWindowRef.current.closed) {
        editOauthWindowRef.current.close();
        editOauthWindowRef.current = null;
        setIsConnected(true);
        const oauthButton = document.getElementById("mondayOauthButton");
        const currentStatus = oauthButton?.innerText;
        if (currentStatus === "Connect Monday" && oauthButton) {
          oauthButton.innerText = "Disconnect Monday";
        }
      }
      await refreshConnections();
    };

    window.addEventListener("message", handler);

    return () => window.removeEventListener("message", handler);
  }, [refreshConnections]);

  return (
    <div className={styles.stepPanel} style={{ maxWidth: 600 }}>
      {/* Header */}
      <div className={styles.panelHeader}>
        <div className={styles.completeIcon} style={{ marginBottom: 8 }}>
          <Check size={36} />
        </div>
        <h2 className={styles.completeTitle} style={{ fontSize: 22 }}>
          Setup Complete
        </h2>
        <p className={styles.panelSubtitle}>
          Your Konnectify workspace is fully configured. Open the{" "}
          <strong style={{ color: "var(--text-primary)" }}>Board View</strong> tab to manage your konnectors.
        </p>
      </div>

      {/* Account info */}
      <div className={styles.infoSection}>
        <p className={styles.sectionLabel}>Account</p>
        <div className={styles.infoGrid}>
          <span className={styles.infoKey}>Domain</span>
          <span className={styles.infoVal}>{tenant?.domain}</span>
          <span className={styles.infoKey}>Email</span>
          <span className={styles.infoVal}>{auth?.email}</span>
        </div>
      </div>

      {/* Connections */}
      <div className={styles.infoSection}>
        <p className={styles.sectionLabel}>Connections</p>

        <MondayEditCard
          connection={mondayConn}
          appId={APP_IDS.monday}
          connectionName="Monday Connection"
          client={client}
          onSaved={() => void refreshConnections()}
          editOauthRef={editOauthWindowRef}
          isConnected={isConnected}
          setIsConnected={setIsConnected}
        />
        <ConnectionEditCard
          label={SECONDARY_APP.displayName}
          connection={secondaryAppConn}
          fields={[{ key: "api_key", label: "API Key", type: "password" }]}
          appId={SECONDARY_APP.appId}
          connectionName={SECONDARY_APP.connectionName}
          client={client}
          onSaved={() => void refreshConnections()}
        />
      </div>

      <button
        className={styles.toggleLink}
        style={{ marginTop: 8 }}
        onClick={() => {
          if (confirm("Are you sure you want to logout?")) void logout();
        }}
      >
        Logout
      </button>
    </div>
  );
};

// ─── ConnectionEditCard ───────────────────────────────────────────────────────

import type { Connection } from "../../types";
import type { KonnectifyClient } from "../../services/konnectifyClient";

interface FieldDef {
  key: string;
  label: string;
  type: "text" | "password";
  suffix?: string;
}

interface ConnectionEditCardProps {
  label: string;
  connection: Connection | null;
  fields: FieldDef[];
  appId: string;
  connectionName: string;
  client: KonnectifyClient | null;
  onSaved: () => void;
}

const ConnectionEditCard: React.FC<ConnectionEditCardProps> = ({
  label,
  connection,
  fields,
  appId,
  connectionName,
  client,
  onSaved,
}) => {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const startEdit = () => {
    // Pre-fill with existing data where available (api_key is never returned by API)
    const prefilled: Record<string, string> = {};
    fields.forEach((f) => {
      prefilled[f.key] = (connection?.data?.[f.key] as string | undefined) ?? "";
    });
    setValues(prefilled);
    setError("");
    setEditing(true);
  };

  const handleSave = async () => {
    if (!client) return;
    setError("");
    setSaving(true);
    try {
      const data: Record<string, unknown> = {};
      fields.forEach((f) => {
        data[f.key] = values[f.key];
      });

      if (connection) {
        await connectionService.edit(client, connection.id, appId, connection.name, data);
      } else {
        await connectionService.create(client, appId, connectionName, data);
      }
      onSaved();
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.connCard}>
      <div className={styles.connCardHeader}>
        <div>
          <span className={styles.connLabel}>{label}</span>
          {connection ? (
            <span className={styles.connStatus}>Connected</span>
          ) : (
            <span className={styles.connStatusMissing}>Not connected</span>
          )}
        </div>
        {!editing && (
          <button className={styles.editLink} onClick={startEdit}>
            {connection ? "Edit" : "Connect"}
          </button>
        )}
      </div>

      {editing && (
        <div className={styles.connForm}>
          {error && (
            <div className={styles.errorAlert} style={{ marginBottom: 12 }}>
              <Warning size={14} />
              <span>{error}</span>
            </div>
          )}
          {fields.map((f) => (
            <div key={f.key} className={styles.formGroup}>
              <label className={styles.formLabel}>{f.label}</label>
              <div className={styles.inputWrapper}>
                <Locked size={16} />
                <input
                  type={f.type}
                  placeholder={f.type === "password" ? "••••••••" : f.label}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  disabled={saving}
                />
                {f.suffix && <span className={styles.domainSuffix}>{f.suffix}</span>}
              </div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <Button kind="primary" size="small" loading={saving} onClick={() => void handleSave()}>
              Save
            </Button>
            <Button kind="tertiary" size="small" disabled={saving} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

// ---- Monday OAuth Edit --------------------------------------------------

interface ConnectionEditOAuthCardProps {
  connection: Connection | null;
  appId: string;
  connectionName: string;
  client: KonnectifyClient | null;
  onSaved: () => void;
  editOauthRef: React.MutableRefObject<Window | null>;
  isConnected: boolean;
  setIsConnected: React.Dispatch<React.SetStateAction<boolean>>;
}

const MondayEditCard: React.FC<ConnectionEditOAuthCardProps> = ({
  connection,
  appId,
  connectionName,
  client,
  onSaved,
  editOauthRef,
  isConnected,
  setIsConnected,
}) => {
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const isEditingConnection = true;
  const connectionId = connection?.id || ""; // contain monday connection id

  async function handleMondayOAuth() {
    try {
      setLoading(true);

      if (!client) return;

      if (!isConnected) {
        // Connect flow
        const oauthUrlResponse = await connectionService.getOAuthUrl(
          client,
          appId,
          connectionName,
          isEditingConnection,
          connectionId
        );

        editOauthRef.current = window.open(oauthUrlResponse.authUrl, "_blank", "width=600,height=700");
      } else {
        // Disconnect flow
        setIsConnected(false);
      }
    } catch (error) {
      console.log(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.connCard}>
      <div className={styles.connCardHeader}>
        <div>
          <span className={styles.connLabel}>
            {" "}
            monday.com
            {isConnected ? (
              <span className={styles.connStatus}> Connected</span>
            ) : (
              <span className={styles.connStatusMissing}>Not connected</span>
            )}
          </span>
        </div>
        {!editing && (
          <button className={styles.editLink} onClick={() => setEditing(true)}>
            {isConnected ? "Edit" : "Connect"}
          </button>
        )}
      </div>

      {/* connect/disconnect button */}
      {editing && (
        <div className={styles.connForm}>
          <Button kind="primary" size="small" loading={loading} onClick={handleMondayOAuth} id="mondayOauthButton">
            {isConnected ? "Disconnect" : "Connect"}
          </Button>
        </div>
      )}
    </div>
  );
};
