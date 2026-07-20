import { WORKFLOW_TEMPLATES } from "../constants";
import { KonnectifyClient } from "./konnectifyClient";
import { storageService } from "./storageService";
import type { Workflow, WorkflowTemplate } from "../types";

export class WorkflowService {
  constructor(private storage = storageService) {}

  async list(client: KonnectifyClient): Promise<Workflow[]> {
    try {
      const workflows = await client.listWorkflows();
      return workflows;
    } catch (error) {
      client.handleError("listWorkflows", error);
    }
  }

  async activate(client: KonnectifyClient, workflowId: string): Promise<void> {
    try {
      await client.activateWorkflow(workflowId);
      await this.list(client);
    } catch (error) {
      client.handleError("activateWorkflow", error);
    }
  }

  async deactivate(client: KonnectifyClient, workflowId: string): Promise<void> {
    try {
      await client.deactivateWorkflow(workflowId);
      await this.list(client);
    } catch (error) {
      client.handleError("deactivateWorkflow", error);
    }
  }

  async installTemplates(client: KonnectifyClient): Promise<Record<string, string>> {
    const installed: Record<string, string> = {};

    for (let i = 0; i < WORKFLOW_TEMPLATES.length; i++) {
      const template = WORKFLOW_TEMPLATES[i];
      try {
        const konnectorId = await client.installKonnectorFromTemplate(template.id);
        if (konnectorId) {
          installed[`konnector_${i + 1}_id`] = konnectorId;
        }
      } catch (error) {
        console.error(`Failed to install template ${template.id}:`, error);
      }
    }

    await this.storage.setConnectors(installed);
    await this.syncTemplateStatus(client, installed);
    await this.list(client);
    return installed;
  }

  async getTemplates(client: KonnectifyClient | null): Promise<WorkflowTemplate[]> {
    const connectors = await this.storage.getConnectors();
    const workflows = client ? await this.list(client).catch(() => []) : [];
    const templates: WorkflowTemplate[] = WORKFLOW_TEMPLATES.map((t, index) => {
      const konnectorId = connectors[`konnector_${index + 1}_id`];
      const installed = Boolean(
        konnectorId || workflows.some((w) => w.name.toLowerCase().includes(t.name.split(" ")[0].toLowerCase()))
      );
      return {
        id: t.id,
        name: t.name,
        description: t.description,
        installed,
        konnectorId,
      };
    });

    await this.storage.setWorkflowTemplates(templates);
    return templates;
  }

  private async syncTemplateStatus(client: KonnectifyClient, connectors: Record<string, string>): Promise<void> {
    await this.getTemplates(client);
    void connectors;
  }
}

export const workflowService = new WorkflowService();
