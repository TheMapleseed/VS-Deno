import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Logger levels for different types of messages
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4
}

/**
 * Diagnostic status of various components
 */
export interface DiagnosticStatus {
  denoInstalled: boolean;
  networkAvailable: boolean;
  fileSystemAccess: boolean;
  websocketStatus: 'connected' | 'disconnected' | 'error' | 'unknown';
  lastError: string | null;
  portInUse: boolean;
  serverRunning: boolean;
  projectStructure: 'valid' | 'invalid' | 'unknown';
}

/**
 * Centralized logger for Deno Live Preview extension
 */
export class Logger {
  private static instance: Logger;
  private outputChannel: vscode.OutputChannel;
  private diagnostics: DiagnosticStatus;
  private logFilePath: string;
  private logLevel: LogLevel;

  private constructor() {
    this.outputChannel = vscode.window.createOutputChannel('Deno Live Preview');
    this.logLevel = LogLevel.INFO;
    this.logFilePath = path.join(os.tmpdir(), 'deno-live-preview-logs.txt');
    
    // Initialize diagnostics with default values
    this.diagnostics = {
      denoInstalled: false,
      networkAvailable: false,
      fileSystemAccess: false,
      websocketStatus: 'unknown',
      lastError: null,
      portInUse: false,
      serverRunning: false,
      projectStructure: 'unknown'
    };
    
    this.debug('Logger initialized');
  }

  /**
   * Get singleton instance of logger
   */
  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Log a debug message
   */
  public debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  /**
   * Log an info message
   */
  public info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data);
  }

  /**
   * Log a warning message
   */
  public warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data);
  }

  /**
   * Log an error message
   */
  public error(message: string, error?: any): void {
    this.log(LogLevel.ERROR, message, error);
    this.diagnostics.lastError = message;
    if (error && error.message) {
      this.diagnostics.lastError += `: ${error.message}`;
    }
  }

  /**
   * Log a critical error
   */
  public critical(message: string, error?: any): void {
    this.log(LogLevel.CRITICAL, message, error);
    this.diagnostics.lastError = message;
    if (error && error.message) {
      this.diagnostics.lastError += `: ${error.message}`;
    }
    
    // Show notification for critical errors
    vscode.window.showErrorMessage(`Deno Live Preview: ${message}${error ? ` - ${error.message}` : ''}`);
  }

  /**
   * Set the current log level
   */
  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
    this.info(`Log level set to ${LogLevel[level]}`);
  }

  /**
   * Update diagnostic information
   */
  public updateDiagnostics(update: Partial<DiagnosticStatus>): void {
    this.diagnostics = { ...this.diagnostics, ...update };
    this.debug('Diagnostics updated', this.diagnostics);
  }

  /**
   * Get current diagnostic status
   */
  public getDiagnostics(): DiagnosticStatus {
    return { ...this.diagnostics };
  }

  /**
   * Run a complete diagnostic check
   */
  public async runDiagnostics(): Promise<DiagnosticStatus> {
    this.info('Running diagnostics check...');
    
    // Check diagnostics here...
    // We'll implement this in the extension.ts file
    
    return this.getDiagnostics();
  }

  /**
   * Show diagnostic information to the user
   */
  public showDiagnosticsToUser(): void {
    const diag = this.getDiagnostics();
    const statusItems = [
      `Deno Installed: ${diag.denoInstalled ? '✅' : '❌'}`,
      `Network Available: ${diag.networkAvailable ? '✅' : '❌'}`,
      `File System Access: ${diag.fileSystemAccess ? '✅' : '❌'}`,
      `WebSocket Status: ${diag.websocketStatus === 'connected' ? '✅ Connected' : 
        diag.websocketStatus === 'disconnected' ? '❌ Disconnected' : 
        diag.websocketStatus === 'error' ? '❌ Error' : '❓ Unknown'}`,
      `Server Running: ${diag.serverRunning ? '✅' : '❌'}`,
      `Port in Use: ${diag.portInUse ? '❌' : '✅ Available'}`,
      `Project Structure: ${diag.projectStructure === 'valid' ? '✅ Valid' : 
        diag.projectStructure === 'invalid' ? '❌ Invalid' : '❓ Unknown'}`
    ];
    
    if (diag.lastError) {
      statusItems.push(`Last Error: ${diag.lastError}`);
    }
    
    const message = 'Deno Live Preview Diagnostics';
    const options = ['View Logs', 'Run Troubleshooter'];
    
    vscode.window.showInformationMessage(message, ...options).then(selection => {
      if (selection === 'View Logs') {
        this.outputChannel.show();
      } else if (selection === 'Run Troubleshooter') {
        this.showTroubleshooter();
      }
    });
    
    // Also log the full diagnostics
    this.info('Diagnostics report:', statusItems.join('\n'));
  }
  
  /**
   * Display the troubleshooter
   */
  private showTroubleshooter(): void {
    const diag = this.getDiagnostics();
    const webviewPanel = vscode.window.createWebviewPanel(
      'denoLivePreviewTroubleshooter',
      'Deno Live Preview Troubleshooter',
      vscode.ViewColumn.One,
      {
        enableScripts: true
      }
    );
    
    webviewPanel.webview.html = this.getTroubleshooterHtml(diag);
    
    webviewPanel.webview.onDidReceiveMessage(message => {
      if (message.command === 'runDiagnostics') {
        this.runDiagnostics().then(updatedDiag => {
          webviewPanel.webview.html = this.getTroubleshooterHtml(updatedDiag);
        });
      }
    });
  }
  
  /**
   * Generate HTML for the troubleshooter
   */
  private getTroubleshooterHtml(diag: DiagnosticStatus): string {
    const issueChecks = [
      {
        name: 'Deno Installation',
        status: diag.denoInstalled,
        message: diag.denoInstalled ? 
          'Deno is correctly installed.' : 
          'Deno is not installed or not in PATH. Please install Deno from https://deno.land/'
      },
      {
        name: 'Network Connectivity',
        status: diag.networkAvailable,
        message: diag.networkAvailable ? 
          'Network connection is available.' : 
          'Network connection issues detected. Check your internet connection.'
      },
      {
        name: 'File System Access',
        status: diag.fileSystemAccess,
        message: diag.fileSystemAccess ? 
          'File system access is working correctly.' : 
          'File system access issues detected. Check file permissions.'
      },
      {
        name: 'WebSocket Connection',
        status: diag.websocketStatus === 'connected',
        message: diag.websocketStatus === 'connected' ? 
          'WebSocket connection is established.' : 
          `WebSocket connection issue: ${diag.websocketStatus}`
      },
      {
        name: 'Server Status',
        status: diag.serverRunning,
        message: diag.serverRunning ? 
          'Server is running correctly.' : 
          'Server is not running. Check port availability and permissions.'
      },
      {
        name: 'Port Availability',
        status: !diag.portInUse,
        message: !diag.portInUse ? 
          'Port is available for use.' : 
          'Port is already in use by another application. Change the port in settings.'
      },
      {
        name: 'Project Structure',
        status: diag.projectStructure === 'valid',
        message: diag.projectStructure === 'valid' ? 
          'Project structure is valid.' : 
          'Project structure may have issues. Check if HTML/CSS/JS files are in the correct location.'
      }
    ];
    
    const statusHtml = issueChecks.map(check => `
      <div class="check-item ${check.status ? 'success' : 'error'}">
        <div class="check-status">${check.status ? '✅' : '❌'}</div>
        <div class="check-details">
          <h3>${check.name}</h3>
          <p>${check.message}</p>
        </div>
      </div>
    `).join('');
    
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Deno Live Preview Troubleshooter</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            padding: 20px;
            color: #333;
          }
          h1 {
            border-bottom: 1px solid #eee;
            padding-bottom: 10px;
            margin-bottom: 20px;
          }
          .check-item {
            display: flex;
            margin-bottom: 15px;
            padding: 12px;
            border-radius: 4px;
          }
          .success {
            background-color: rgba(0, 255, 0, 0.1);
          }
          .error {
            background-color: rgba(255, 0, 0, 0.1);
          }
          .check-status {
            margin-right: 15px;
            font-size: 24px;
          }
          .check-details h3 {
            margin-top: 0;
            margin-bottom: 5px;
          }
          .check-details p {
            margin-top: 0;
          }
          .actions {
            margin-top: 20px;
          }
          button {
            padding: 8px 16px;
            background-color: #007ACC;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          }
          button:hover {
            background-color: #005999;
          }
          .last-error {
            margin-top: 20px;
            color: #d32f2f;
            padding: 10px;
            background-color: rgba(255, 0, 0, 0.05);
            border-radius: 4px;
          }
        </style>
      </head>
      <body>
        <h1>Deno Live Preview Troubleshooter</h1>
        
        <div class="diagnostics">
          ${statusHtml}
        </div>
        
        ${diag.lastError ? `
          <div class="last-error">
            <strong>Last Error:</strong> ${diag.lastError}
          </div>
        ` : ''}
        
        <div class="actions">
          <button id="runDiagnosticsBtn">Run Diagnostics Again</button>
        </div>
        
        <script>
          const vscode = acquireVsCodeApi();
          
          document.getElementById('runDiagnosticsBtn').addEventListener('click', () => {
            vscode.postMessage({
              command: 'runDiagnostics'
            });
          });
        </script>
      </body>
      </html>
    `;
  }

  /**
   * Generic log method
   */
  private log(level: LogLevel, message: string, data?: any): void {
    if (level < this.logLevel) {
      return;
    }
    
    const timestamp = new Date().toISOString();
    const levelString = LogLevel[level].padEnd(8);
    let logMessage = `[${timestamp}] [${levelString}] ${message}`;
    
    if (data) {
      if (typeof data === 'object') {
        try {
          logMessage += '\n' + JSON.stringify(data, null, 2);
        } catch (e) {
          logMessage += '\n[Object could not be stringified]';
        }
      } else {
        logMessage += '\n' + data.toString();
      }
    }
    
    // Log to output channel
    this.outputChannel.appendLine(logMessage);
    
    // Also log to file
    this.logToFile(logMessage);
  }
  
  /**
   * Write log to file
   */
  private logToFile(message: string): void {
    try {
      fs.appendFileSync(this.logFilePath, message + '\n');
    } catch (error) {
      // Can't log to file, just continue
      this.outputChannel.appendLine(`[ERROR] Failed to write to log file: ${error}`);
    }
  }
} 