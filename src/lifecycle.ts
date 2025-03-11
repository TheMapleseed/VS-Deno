import * as vscode from 'vscode';
import { Logger } from './logger';
import { DiagnosticHelper } from './diagnostics';

// Get the logger instance
const logger = Logger.getInstance();
const diagnostics = new DiagnosticHelper();

/**
 * Lifecycle step status
 */
export enum StepStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  SUCCESS = 'success',
  FAILURE = 'failure',
  SKIPPED = 'skipped'
}

/**
 * A step in the extension lifecycle
 */
export interface LifecycleStep {
  id: string;
  name: string;
  description: string;
  status: StepStatus;
  startTime?: number;
  endTime?: number;
  duration?: number;
  error?: Error | string;
  details?: string;
  parent?: string;
  children: string[];
}

/**
 * Tracks the lifecycle of the extension
 */
export class LifecycleTracker {
  private static instance: LifecycleTracker;
  private steps: Map<string, LifecycleStep> = new Map();
  private currentStepId: string | null = null;
  private startTime: number = 0;
  private statusBarItem: vscode.StatusBarItem | null = null;
  
  private constructor() {
    // Initialize the tracker with a root step
    this.startTime = Date.now();
    
    // Add root step
    this.steps.set('root', {
      id: 'root',
      name: 'Extension Lifecycle',
      description: 'Tracks the entire extension lifecycle',
      status: StepStatus.RUNNING,
      startTime: this.startTime,
      children: []
    });
    
    this.currentStepId = 'root';
    
    // Create status bar item
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 97);
    this.statusBarItem.text = '$(sync~spin) Deno Live Preview Loading...';
    this.statusBarItem.tooltip = 'Click to view detailed extension status';
    this.statusBarItem.command = 'deno-live-preview.showLifecycleReport';
    this.statusBarItem.show();
    
    logger.debug('LifecycleTracker initialized');
  }
  
  /**
   * Get the singleton instance
   */
  public static getInstance(): LifecycleTracker {
    if (!LifecycleTracker.instance) {
      LifecycleTracker.instance = new LifecycleTracker();
    }
    return LifecycleTracker.instance;
  }
  
  /**
   * Start tracking a new step
   */
  public beginStep(id: string, name: string, description: string, parentId?: string): string {
    let parent = parentId || this.currentStepId || 'root';
    
    // Ensure parent exists
    if (!this.steps.has(parent)) {
      logger.warn(`Parent step "${parent}" does not exist, using root as parent`);
      parent = 'root';
    }
    
    // Log step beginning
    logger.debug(`Beginning step: ${name} (${id})`);
    
    // Create the step
    const step: LifecycleStep = {
      id,
      name,
      description,
      status: StepStatus.RUNNING,
      startTime: Date.now(),
      parent,
      children: []
    };
    
    // Add to parent's children
    const parentStep = this.steps.get(parent);
    if (parentStep) {
      parentStep.children.push(id);
    }
    
    // Add to steps map
    this.steps.set(id, step);
    
    // Update current step
    this.currentStepId = id;
    
    // Update status bar
    this.updateStatusBar();
    
    return id;
  }
  
  /**
   * Mark the current step as complete
   */
  public completeStep(id?: string, details?: string): void {
    const stepId = id || this.currentStepId;
    
    if (!stepId) {
      logger.warn('No current step to complete');
      return;
    }
    
    const step = this.steps.get(stepId);
    if (!step) {
      logger.warn(`Step "${stepId}" not found`);
      return;
    }
    
    // Calculate duration
    const now = Date.now();
    step.endTime = now;
    step.status = StepStatus.SUCCESS;
    
    if (step.startTime) {
      step.duration = now - step.startTime;
    }
    
    if (details) {
      step.details = details;
    }
    
    logger.debug(`Completed step: ${step.name} (${step.id})${step.duration ? ` in ${step.duration}ms` : ''}`);
    
    // Set current step to parent
    this.currentStepId = step.parent || 'root';
    
    // Update status bar
    this.updateStatusBar();
  }
  
  /**
   * Mark the current step as failed
   */
  public failStep(id?: string, error?: Error | string, details?: string): void {
    const stepId = id || this.currentStepId;
    
    if (!stepId) {
      logger.warn('No current step to fail');
      return;
    }
    
    const step = this.steps.get(stepId);
    if (!step) {
      logger.warn(`Step "${stepId}" not found`);
      return;
    }
    
    // Calculate duration
    const now = Date.now();
    step.endTime = now;
    step.status = StepStatus.FAILURE;
    
    if (step.startTime) {
      step.duration = now - step.startTime;
    }
    
    if (error) {
      step.error = error;
    }
    
    if (details) {
      step.details = details;
    }
    
    logger.error(`Failed step: ${step.name} (${step.id})${step.duration ? ` after ${step.duration}ms` : ''}`, error);
    
    // Update status bar to error state
    if (this.statusBarItem) {
      this.statusBarItem.text = `$(error) Deno Live Preview Error`;
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('errorForeground');
    }
    
    // Set current step to parent
    this.currentStepId = step.parent || 'root';
  }
  
  /**
   * Skip a planned step
   */
  public skipStep(id: string, reason: string): void {
    const step = this.steps.get(id);
    
    if (!step) {
      logger.warn(`Step "${id}" not found to skip`);
      return;
    }
    
    step.status = StepStatus.SKIPPED;
    step.details = reason;
    
    logger.debug(`Skipped step: ${step.name} (${step.id}) - ${reason}`);
  }
  
  /**
   * Generate a lifecycle report
   */
  public generateReport(): string {
    const root = this.steps.get('root');
    if (!root) {
      return 'No lifecycle data available';
    }
    
    // Mark root as complete if it's still running
    if (root.status === StepStatus.RUNNING) {
      root.status = StepStatus.SUCCESS;
      root.endTime = Date.now();
      if (root.startTime) {
        root.duration = root.endTime - root.startTime;
      }
    }
    
    let report = '# Deno Live Preview Lifecycle Report\n\n';
    report += `**Start Time**: ${new Date(this.startTime).toISOString()}\n`;
    report += `**Current Time**: ${new Date().toISOString()}\n`;
    report += `**Total Duration**: ${Date.now() - this.startTime}ms\n\n`;
    
    report += '## Step Summary\n\n';
    
    // Find failed step if any
    const failedStep = Array.from(this.steps.values()).find(step => step.status === StepStatus.FAILURE);
    if (failedStep) {
      report += '⚠️ **Extension encountered an error:**\n\n';
      report += `The step **${failedStep.name}** failed with error: ${failedStep.error}\n\n`;
    } else {
      const pendingSteps = Array.from(this.steps.values()).filter(step => step.status === StepStatus.RUNNING || step.status === StepStatus.PENDING);
      if (pendingSteps.length > 0) {
        report += '⏳ **Extension is still initializing:**\n\n';
        report += `Currently executing: **${pendingSteps[0].name}**\n\n`;
      } else {
        report += '✅ **Extension initialized successfully**\n\n';
      }
    }
    
    // Generate a tree of steps
    report += '## Detailed Steps\n\n';
    report += this.generateStepTree('root', 0);
    
    return report;
  }
  
  /**
   * Recursively generate step tree
   */
  private generateStepTree(stepId: string, level: number): string {
    const step = this.steps.get(stepId);
    if (!step) {
      return '';
    }
    
    const indent = '  '.repeat(level);
    const statusIcon = 
      step.status === StepStatus.SUCCESS ? '✅' :
      step.status === StepStatus.FAILURE ? '❌' :
      step.status === StepStatus.SKIPPED ? '⏭️' :
      step.status === StepStatus.RUNNING ? '⏳' :
      '⌛';
    
    let output = `${indent}${statusIcon} **${step.name}**`;
    
    if (step.duration) {
      output += ` (${step.duration}ms)`;
    }
    
    output += '\n';
    
    if (step.details) {
      output += `${indent}  ${step.details}\n`;
    }
    
    if (step.error) {
      output += `${indent}  Error: ${step.error}\n`;
    }
    
    // Add children
    for (const childId of step.children) {
      output += this.generateStepTree(childId, level + 1);
    }
    
    return output;
  }
  
  /**
   * Show a webview with the lifecycle report
   */
  public showReportWebview(): void {
    const panel = vscode.window.createWebviewPanel(
      'denoLivePreviewLifecycle',
      'Deno Live Preview: Status Report',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );
    
    // Generate report
    const reportMarkdown = this.generateReport();
    
    // Create HTML
    panel.webview.html = this.getReportHtml(reportMarkdown);
    
    // Set up timer to refresh the webview
    const refreshInterval = setInterval(() => {
      if (panel.visible) {
        panel.webview.html = this.getReportHtml(this.generateReport());
      }
    }, 1000);
    
    // Clean up when the panel is closed
    panel.onDidDispose(() => {
      clearInterval(refreshInterval);
    });
  }
  
  /**
   * Generate HTML for the report
   */
  private getReportHtml(reportMarkdown: string): string {
    // Convert markdown to HTML (very basic conversion)
    const htmlContent = reportMarkdown
      .replace(/^# (.*)$/gm, '<h1>$1</h1>')
      .replace(/^## (.*)$/gm, '<h2>$1</h2>')
      .replace(/^### (.*)$/gm, '<h3>$1</h3>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');
    
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Deno Live Preview: Status Report</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
          }
          h1 {
            color: var(--vscode-titleBar-activeForeground);
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 10px;
          }
          h2 {
            color: var(--vscode-textLink-foreground);
            margin-top: 20px;
          }
          .success { color: var(--vscode-testing-iconPassed); }
          .failure { color: var(--vscode-testing-iconFailed); }
          .running { color: var(--vscode-testing-iconQueued); }
          .skipped { color: var(--vscode-testing-iconSkipped); }
          .step { 
            margin: 5px 0;
            padding: 5px;
            border-radius: 3px;
          }
          .details {
            margin-left: 20px;
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
          }
          .error {
            color: var(--vscode-errorForeground);
            background-color: var(--vscode-inputValidation-errorBackground);
            padding: 10px;
            margin: 10px 0;
            border-radius: 3px;
          }
          code {
            font-family: var(--vscode-editor-font-family);
            background-color: var(--vscode-textBlockQuote-background);
            padding: 2px 4px;
            border-radius: 3px;
          }
        </style>
      </head>
      <body>
        <div id="report">
          ${htmlContent}
        </div>
      </body>
      </html>
    `;
  }
  
  /**
   * Update the status bar with current step info
   */
  private updateStatusBar(): void {
    if (!this.statusBarItem) {
      return;
    }
    
    const currentStep = this.currentStepId ? this.steps.get(this.currentStepId) : null;
    
    if (!currentStep) {
      this.statusBarItem.text = '$(check) Deno Live Preview Ready';
      this.statusBarItem.backgroundColor = undefined;
      return;
    }
    
    // Find the first failed step if any
    const failedStep = Array.from(this.steps.values()).find(step => step.status === StepStatus.FAILURE);
    
    if (failedStep) {
      this.statusBarItem.text = `$(error) Deno Live Preview Error`;
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('errorForeground');
    } else if (currentStep.id === 'root' && currentStep.status === StepStatus.SUCCESS) {
      this.statusBarItem.text = '$(check) Deno Live Preview Ready';
      this.statusBarItem.backgroundColor = undefined;
    } else {
      this.statusBarItem.text = `$(sync~spin) ${currentStep.name}...`;
      this.statusBarItem.backgroundColor = undefined;
    }
  }
  
  /**
   * Get all steps
   */
  public getSteps(): Map<string, LifecycleStep> {
    return new Map(this.steps);
  }
  
  /**
   * Get a specific step
   */
  public getStep(id: string): LifecycleStep | undefined {
    return this.steps.get(id);
  }
  
  /**
   * Dispose of resources
   */
  public dispose(): void {
    if (this.statusBarItem) {
      this.statusBarItem.dispose();
      this.statusBarItem = null;
    }
  }
} 