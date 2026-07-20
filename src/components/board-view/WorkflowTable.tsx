import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Loader, Search, Text, Toggle } from "@vibe/core";
import { useKonnectify } from "../../hooks";
import { iframeService } from "../../services/iframeService";
import { workflowService } from "../../services/workflowService";
import { EmptyPlaceholder } from "../common/EmptyPlaceholder";
import { useToast } from "../common/useToast";
import type { IframeDestination, Workflow } from "../../types";
import styles from "./WorkflowTable.module.css";

type ActionType = IframeDestination["type"];

interface DetailView {
  workflow: Workflow | null; // null = "create new" view
  type: ActionType;
  url: string;
}

export const WorkflowTable: React.FC = () => {
  const {
    client,
    tenant,
    workflows,
    refreshWorkflows,
    isConfigured,
    ensureToken,
  } = useKonnectify();
  //const { tenant, ensureToken, isConfigured } = useKonnectify();
  const { showToast, toastElement } = useToast();

  const [search, setSearch] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [detailView, setDetailView] = useState<DetailView | null>(null);
  const [iframeLoading, setIframeLoading] = useState(false);

  useEffect(() => {
    if (isConfigured) void loadWorkflows();
  }, [isConfigured]);

  const loadWorkflows = async () => {
    setListLoading(true);
    try {
      await refreshWorkflows();
    } finally {
      setListLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    if (!term) return workflows;
    return workflows.filter(
      (w) =>
        w.name.toLowerCase().includes(term) ||
        (w.description ?? "").toLowerCase().includes(term),
    );
  }, [workflows, search]);

  const openDetail = useCallback(
    async (workflow: Workflow | null, type: ActionType) => {
      if (!tenant) return;
      setIframeLoading(true);
      setDetailView({ workflow, type, url: "" });
      try {
        const token = await ensureToken();
        const url = workflow
          ? iframeService.buildDestinationUrl(
              tenant.domain,
              { type, workflowId: workflow.id },
              token,
            )
          : iframeService.buildDestinationUrl(tenant.domain, { type: "create" }, token);
        setDetailView({ workflow, type, url });
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Failed to open viewer", "negative");
        setDetailView(null);
      } finally {
        setIframeLoading(false);
      }
    },
    [tenant, ensureToken, showToast],
  );

  const closeDetail = useCallback(() => {
    setDetailView(null);
    void refreshWorkflows();
  }, [refreshWorkflows]);

  const handleToggle = async (workflow: Workflow) => {
    if (!client) return;
    setTogglingId(workflow.id);
    try {
      if (workflow.enabled) {
        await workflowService.deactivate(client, workflow.id);
      } else {
        await workflowService.activate(client, workflow.id);
      }
      await refreshWorkflows();
      showToast(`"${workflow.name}" ${workflow.enabled ? "disabled" : "enabled"}`, "positive");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Toggle failed", "negative");
    } finally {
      setTogglingId(null);
    }
  };

  if (!isConfigured) {
    return (
      <EmptyPlaceholder
        title="Not configured"
        description="Configure Konnectify in Account Settings to manage workflows."
      />
    );
  }

  // ── Detail / iframe pane ──────────────────────────────────────────────────
  if (detailView) {
    const isCreate = detailView.workflow === null;
    return (
      <div className={styles.detailPane}>
        {toastElement}
        <div className={styles.detailHeader}>
          <Button kind="tertiary" size="small" onClick={closeDetail}>
            ← Back
          </Button>
          <div className={styles.detailMeta}>
            <Text type="text1" weight="bold">
              {isCreate ? "Create Konnector" : detailView.workflow!.name}
            </Text>
            {!isCreate && (
              <Text type="text3" color="secondary">
                {detailView.type === "edit" ? "Edit" : "View"}
              </Text>
            )}
          </div>
          {!isCreate && (
            <div className={styles.detailSwitcher}>
              {(["view", "edit"] as ActionType[]).map((t) => (
                <Button
                  key={t}
                  kind={detailView.type === t ? "secondary" : "tertiary"}
                  size="small"
                  onClick={() => void openDetail(detailView.workflow, t)}
                  disabled={iframeLoading}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Button>
              ))}
            </div>
          )}
        </div>
        <div className={styles.iframeWrapper}>
          {(iframeLoading || !detailView.url) && (
            <div className={styles.iframeLoader}>
              <Loader size="medium" />
            </div>
          )}
          {detailView.url && (
            <iframe
              key={detailView.url}
              src={detailView.url}
              title={detailView.workflow?.name ?? "Create Konnector"}
              className={styles.detailIframe}
              onLoad={() => setIframeLoading(false)}
            />
          )}
        </div>
      </div>
    );
  }

  // ── Workflow list ─────────────────────────────────────────────────────────
  return (
    <div className={styles.container}>
      {toastElement}

      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <Search
            placeholder="Search workflows…"
            value={search}
            onChange={setSearch}
            size="medium"
          />
        </div>
        {listLoading && <Loader size="small" />}
        <Button kind="primary" size="small" onClick={() => void openDetail(null, "create")}>
          + Create Konnector
        </Button>
      </div>

      {listLoading && workflows.length === 0 ? (
        <div className={styles.centerLoader}>
          <Loader size="medium" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyPlaceholder
          title={search ? "No results" : "No workflows yet"}
          description={
            search
              ? `No workflows match "${search}"`
              : "Sync workflows or install templates from Account Settings."
          }
          action={
            !search ? (
              <Button kind="primary" size="small" onClick={() => void loadWorkflows()}>
                Sync Workflows
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className={styles.list}>
          {filtered.map((workflow) => (
            <WorkflowRow
              key={workflow.id}
              workflow={workflow}
              toggling={togglingId === workflow.id}
              onToggle={() => void handleToggle(workflow)}
              onOpen={(type) => void openDetail(workflow, type as ActionType)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ── WorkflowRow ──────────────────────────────────────────────────────────────

interface WorkflowRowProps {
  workflow: Workflow;
  toggling: boolean;
  onToggle: () => void;
  onOpen: (type: ActionType) => void;
}

const WorkflowRow: React.FC<WorkflowRowProps> = ({ workflow, toggling, onToggle, onOpen }) => {
  const lastActivity = workflow.lastRun || workflow.lastModified;

  return (
    <div className={styles.row}>
      {/* Status dot */}
      <span
        className={styles.dot}
        style={{ background: workflow.enabled ? "var(--positive-color, #258750)" : "var(--ui-border-color, #c5c7d0)" }}
        title={workflow.enabled ? "Active" : "Inactive"}
      />

      {/* Name + description */}
      <div className={styles.rowInfo}>
        <Text type="text2" weight="medium" className={styles.rowName}>
          {workflow.name}
        </Text>
        {workflow.description && (
          <Text type="text3" color="secondary" className={styles.rowDesc}>
            {workflow.description}
          </Text>
        )}
      </div>

      {/* Last activity */}
      <div className={styles.rowMeta}>
        {lastActivity ? (
          <>
            <Text type="text3" color="secondary">Last run</Text>
            <Text type="text3">{new Date(lastActivity).toLocaleDateString()}</Text>
          </>
        ) : (
          <Text type="text3" color="secondary">Never run</Text>
        )}
      </div>

      {/* Toggle */}
      <div className={styles.rowToggle}>
        <Toggle
          isSelected={workflow.enabled}
          onChange={onToggle}
          disabled={toggling}
          areLabelsHidden
          aria-label={`Toggle ${workflow.name}`}
        />
        {toggling && <Loader size="small" />}
      </div>

      {/* Actions — shown on row hover */}
      <div className={styles.rowActions}>
        <Button kind="tertiary" size="small" onClick={() => onOpen("view")}>View</Button>
        <Button kind="tertiary" size="small" onClick={() => onOpen("edit")}>Edit</Button>
      </div>
    </div>
  );
};
