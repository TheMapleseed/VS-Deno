import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from './logger';
import { DiagnosticHelper } from './diagnostics';

// Get logger instance
const logger = Logger.getInstance();
const diagnosticsHelper = new DiagnosticHelper();

/**
 * Manages webview panel for Live Preview
 */
export class DenoPreviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'deno-live-preview.preview';
  
  private _view?: vscode.WebviewView;
  private _previewUrl: string = '';
  private _outputLines: string[] = [];
  private _extensionUri: vscode.Uri;
  private _activeFile: string = '';
  private _activeFileType: string = '';
  private _refreshCounter: number = 0;
  private _lastDiagnosticsCheck: number = 0;
  private _healthCheckInterval?: NodeJS.Timeout;
  private _connectionStatus: 'connected' | 'disconnected' | 'error' | 'unknown' = 'unknown';

  constructor(private readonly extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
    logger.debug('DenoPreviewProvider initialized');
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    logger.debug('Resolving webview view');
    this._view = webviewView;

    webviewView.webview.options = {
      // Enable scripts in the webview
      enableScripts: true,
      
      // Restrict the webview to only load resources from the extension's directory and the server
      localResourceRoots: [
        this._extensionUri,
        // Allow loading resources from localhost
        vscode.Uri.parse('http://localhost'),
      ]
    };

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(message => {
      logger.debug('Received message from webview', message);
      switch (message.command) {
        case 'refresh':
          vscode.commands.executeCommand('deno-live-preview.refresh');
          break;
        case 'openInBrowser':
          this.openInBrowser();
          break;
        case 'clearOutput':
          this._outputLines = [];
          this._updateWebviewContent();
          break;
        case 'runDiagnostics':
          vscode.commands.executeCommand('deno-live-preview.showDiagnostics');
          break;
        case 'connectionStatus':
          this.updateConnectionStatus(message.status);
          break;
      }
    });

    this._updateWebviewContent();
    
    // Start health check interval
    this.startHealthCheck();
  }

  /**
   * Set the active file being previewed
   */
  public setActiveFile(filePath: string) {
    logger.debug(`Setting active file: ${filePath}`);
    this._activeFile = filePath;
    this._activeFileType = path.extname(filePath).toLowerCase();
    this._updateWebviewContent();
  }

  /**
   * Set the URL for the preview iframe
   */
  public setPreviewUrl(url: string) {
    logger.debug(`Setting preview URL: ${url}`);
    this._previewUrl = url;
    this._updateWebviewContent();
    
    // Start health check for the new URL
    this.startHealthCheck();
  }

  /**
   * Refresh the preview
   */
  public refreshPreview() {
    this._refreshCounter++;
    logger.debug(`Refreshing preview (counter: ${this._refreshCounter})`);
    if (this._view) {
      this._view.webview.postMessage({
        command: 'refresh',
        counter: this._refreshCounter
      });
    }
  }

  /**
   * Append output to the console section
   */
  public appendOutput(output: string) {
    // Add line to output buffer
    const lines = output.split('\n').filter(line => line.trim() !== '');
    this._outputLines.push(...lines);
    
    // Check for error messages in output
    const errorLines = lines.filter(line => 
      line.toLowerCase().includes('error') || 
      line.toLowerCase().includes('exception') ||
      line.toLowerCase().includes('failed')
    );
    
    if (errorLines.length > 0) {
      // Log errors to the extension logger
      for (const errorLine of errorLines) {
        logger.error(`Server error: ${errorLine}`);
      }
    }
    
    // Parse WebSocket connection messages
    if (output.includes('WebSocket connection established')) {
      this.updateConnectionStatus('connected');
    } else if (output.includes('WebSocket connection closed') || 
              output.includes('WebSocket error')) {
      this.updateConnectionStatus('disconnected');
    }
    
    // Limit the number of lines (keep last 200)
    if (this._outputLines.length > 200) {
      this._outputLines = this._outputLines.slice(-200);
    }
    
    if (this._view) {
      this._view.webview.postMessage({
        command: 'updateOutput',
        output: lines.join('\n')
      });
    }
  }

  /**
   * Clear the preview and output
   */
  public clearPreview() {
    logger.debug('Clearing preview');
    this._previewUrl = '';
    this._outputLines = [];
    this._activeFile = '';
    this._activeFileType = '';
    this.updateConnectionStatus('unknown');
    this._updateWebviewContent();
    
    // Clear health check interval
    this.stopHealthCheck();
  }

  /**
   * Update connection status
   */
  private updateConnectionStatus(status: 'connected' | 'disconnected' | 'error' | 'unknown'): void {
    if (this._connectionStatus !== status) {
      logger.debug(`WebSocket connection status changed: ${this._connectionStatus} -> ${status}`);
      this._connectionStatus = status;
      
      // Update diagnostics
      diagnosticsHelper.updateWebSocketStatus(status);
      
      // Notify the webview
      if (this._view) {
        this._view.webview.postMessage({
          command: 'connectionStatus',
          status: status
        });
      }
    }
  }
  
  /**
   * Start health check interval
   */
  private startHealthCheck(): void {
    this.stopHealthCheck();
    
    if (!this._previewUrl) {
      return;
    }
    
    logger.debug('Starting health check interval');
    
    this._healthCheckInterval = setInterval(() => {
      this.checkServerHealth();
    }, 10000);
  }
  
  /**
   * Stop health check interval
   */
  private stopHealthCheck(): void {
    if (this._healthCheckInterval) {
      logger.debug('Stopping health check interval');
      clearInterval(this._healthCheckInterval);
      this._healthCheckInterval = undefined;
    }
  }
  
  /**
   * Check server health by fetching diagnostics endpoint
   */
  private async checkServerHealth(): Promise<void> {
    if (!this._previewUrl) {
      return;
    }
    
    // Only check every 10 seconds at most
    const now = Date.now();
    if (now - this._lastDiagnosticsCheck < 10000) {
      return;
    }
    
    this._lastDiagnosticsCheck = now;
    
    try {
      const url = new URL(this._previewUrl);
      const diagnosticsUrl = `${url.protocol}//${url.host}/_diagnostics`;
      
      logger.debug(`Checking server health: ${diagnosticsUrl}`);
      
      const response = await fetch(diagnosticsUrl, { 
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' }
      });
      
      if (response.ok) {
        const data = await response.json() as { 
          activeWsConnections: number; 
          wsConnections: number;
          errors: number;
          lastError: string | null;
        };
        
        logger.debug('Server health check successful', data);
        
        // Update connection status based on WebSocket connections
        if (data.activeWsConnections > 0) {
          this.updateConnectionStatus('connected');
        } else if (data.wsConnections > 0 && data.activeWsConnections === 0) {
          this.updateConnectionStatus('disconnected');
        }
        
        // Log any server errors
        if (data.errors > 0 && data.lastError) {
          logger.warn(`Server reported errors: ${data.lastError}`);
        }
      } else {
        logger.warn(`Server health check failed: ${response.status} ${response.statusText}`);
        this.updateConnectionStatus('error');
      }
    } catch (error) {
      logger.error('Error checking server health', error);
      this.updateConnectionStatus('error');
    }
  }

  /**
   * Open current preview in browser
   */
  private openInBrowser(): void {
    if (this._previewUrl) {
      logger.debug(`Opening in browser: ${this._previewUrl}`);
      vscode.env.openExternal(vscode.Uri.parse(this._previewUrl));
    }
  }

  /**
   * Dispose of resources used by the preview provider
   */
  public dispose() {
    logger.debug('Disposing preview provider');
    
    // Stop health check
    this.stopHealthCheck();
    
    // Clear all state
    this.clearPreview();
    
    // Remove reference to the webview
    this._view = undefined;
  }

  /**
   * Update the webview content
   */
  private _updateWebviewContent() {
    if (!this._view) {
      return;
    }

    const webview = this._view.webview;

    // Create HTML for the webview
    const html = this._getHtmlForWebview(webview);
    webview.html = html;
  }

  /**
   * Get the HTML for the webview content - with additional diagnostic features
   */
  private _getHtmlForWebview(webview: vscode.Webview): string {
    // Get the local path to scripts and css
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'main.js')
    );

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'style.css')
    );

    // Use CSP to limit script execution to only our extension's scripts
    const nonce = this._getNonce();
    
    // Generate appropriate CSP based on file type
    let frameAncestors = '';
    if (this._previewUrl) {
      const url = new URL(this._previewUrl);
      frameAncestors = url.origin;
    }
    
    // Improved CSP that allows necessary connections while maintaining security
    const csp = `
      default-src 'none'; 
      img-src ${webview.cspSource} https: http://localhost:* data:; 
      style-src ${webview.cspSource} 'nonce-${nonce}' 'unsafe-inline'; 
      script-src 'nonce-${nonce}' 'unsafe-eval'; 
      frame-src ${frameAncestors} http://localhost:* https:; 
      connect-src http://localhost:* ws://localhost:* wss://localhost:* ${webview.cspSource};
      font-src ${webview.cspSource} http://localhost:*;
      base-uri 'none';
      form-action 'none';
    `.replace(/\s+/g, ' ').trim();

    const outputHtml = this._outputLines.map(line => {
      // Escape HTML
      const escaped = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
        
      // Add class for errors
      const isError = line.toLowerCase().includes('error') || 
                     line.toLowerCase().includes('exception') ||
                     line.toLowerCase().includes('failed');
      const isWarning = !isError && 
                       (line.toLowerCase().includes('warn') || 
                        line.toLowerCase().includes('deprecated'));
      const isInfo = !isError && !isWarning && 
                    (line.toLowerCase().includes('info') || 
                     line.toLowerCase().includes('server running'));
      
      let className = 'line';
      if (isError) className += ' error';
      if (isWarning) className += ' warning';
      if (isInfo) className += ' info';
                     
      return `<div class="${className}">${escaped}</div>`;
    }).join('');

    // Get active file info for display
    const fileInfo = this._activeFile ? path.basename(this._activeFile) : 'Not running';
    const fileTypeDisplay = this._activeFileType ? this._activeFileType.substring(1).toUpperCase() : '';
    
    // Connection status indicator
    const connectionStatusClass = 
      this._connectionStatus === 'connected' ? 'connection-status-connected' :
      this._connectionStatus === 'disconnected' ? 'connection-status-disconnected' :
      this._connectionStatus === 'error' ? 'connection-status-error' :
      'connection-status-unknown';
    
    const connectionStatusText = 
      this._connectionStatus === 'connected' ? 'Connected' :
      this._connectionStatus === 'disconnected' ? 'Disconnected' :
      this._connectionStatus === 'error' ? 'Error' :
      'Unknown';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <title>Deno Live Preview</title>
    <style nonce="${nonce}">
        body {
            padding: 0;
            margin: 0;
            width: 100%;
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        
        .preview-container {
            flex: 2;
            display: flex;
            flex-direction: column;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .preview-header {
            display: flex;
            padding: 8px;
            background-color: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            align-items: center;
        }
        
        .preview-label {
            font-weight: bold;
            margin-right: 10px;
            white-space: nowrap;
        }
        
        .preview-url {
            flex: 1;
            color: var(--vscode-textLink-foreground);
            user-select: text;
            cursor: text;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        
        .file-badge {
            margin-left: 10px;
            padding: 2px 6px;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 4px;
            font-size: 0.8em;
        }
        
        .toolbar {
            display: flex;
            gap: 4px;
            margin-left: 10px;
        }
        
        .toolbar-button {
            background: none;
            border: none;
            color: var(--vscode-button-foreground);
            cursor: pointer;
            padding: 2px 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 3px;
            font-size: 12px;
        }
        
        .toolbar-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .toolbar-button:active {
            background-color: var(--vscode-button-background);
        }
        
        .toolbar-button-icon {
            margin-right: 4px;
        }
        
        .preview-frame-container {
            flex: 1;
            overflow: hidden;
            background-color: white;
            position: relative;
        }
        
        .preview-frame {
            width: 100%;
            height: 100%;
            border: none;
            position: relative;
            z-index: 1;
        }
        
        .preview-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 2;
            color: white;
            font-size: 1.2em;
            display: none;
        }
        
        .preview-overlay.visible {
            display: flex;
        }
        
        .preview-spinner {
            margin-right: 10px;
            animation: spin 1.5s linear infinite;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .output-container {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-height: 100px;
            max-height: 25vh;
        }
        
        .output-header {
            display: flex;
            padding: 8px;
            background-color: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            justify-content: space-between;
            align-items: center;
        }
        
        .output-title {
            display: flex;
            align-items: center;
        }
        
        .clear-button {
            background: none;
            border: none;
            color: var(--vscode-button-foreground);
            cursor: pointer;
            padding: 2px 6px;
            font-size: 12px;
        }
        
        .clear-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .output-console {
            flex: 1;
            overflow-y: auto;
            padding: 8px;
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            background-color: var(--vscode-terminal-background, #1e1e1e);
            color: var(--vscode-terminal-foreground, #cccccc);
            white-space: pre-wrap;
        }
        
        .line {
            margin-bottom: 2px;
        }
        
        .error {
            color: var(--vscode-errorForeground, #f48771);
        }
        
        .warning {
            color: var(--vscode-editorWarning-foreground, #cca700);
        }
        
        .info {
            color: var(--vscode-editorInfo-foreground, #75beff);
        }
        
        .placeholder {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100%;
            color: var(--vscode-disabledForeground);
            font-style: italic;
        }
        
        .resize-handle {
            height: 5px;
            background-color: var(--vscode-panel-border);
            cursor: ns-resize;
        }
        
        .device-selector {
            display: flex;
            padding: 4px 8px;
            background-color: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .device-button {
            background: none;
            border: 1px solid var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            margin-right: 4px;
            padding: 2px 8px;
            cursor: pointer;
            border-radius: 3px;
            font-size: 12px;
        }
        
        .device-button:hover, .device-button.active {
            background-color: var(--vscode-button-background);
        }
        
        /* Diagnostics Section */
        .diagnostics-bar {
            display: flex;
            padding: 4px 8px;
            background-color: var(--vscode-editor-background);
            border-top: 1px solid var(--vscode-panel-border);
            align-items: center;
            font-size: 12px;
        }
        
        .connection-status {
            display: flex;
            align-items: center;
            margin-right: 10px;
            padding: 2px 8px;
            border-radius: 10px;
            white-space: nowrap;
        }
        
        .connection-status-icon {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            margin-right: 5px;
        }
        
        .connection-status-connected {
            background-color: rgba(0, 255, 0, 0.1);
            color: var(--vscode-charts-green);
        }
        
        .connection-status-connected .connection-status-icon {
            background-color: var(--vscode-charts-green);
        }
        
        .connection-status-disconnected {
            background-color: rgba(255, 0, 0, 0.1);
            color: var(--vscode-charts-red);
        }
        
        .connection-status-disconnected .connection-status-icon {
            background-color: var(--vscode-charts-red);
        }
        
        .connection-status-error {
            background-color: rgba(255, 0, 0, 0.1);
            color: var(--vscode-charts-red);
        }
        
        .connection-status-error .connection-status-icon {
            background-color: var(--vscode-charts-red);
        }
        
        .connection-status-unknown {
            background-color: rgba(128, 128, 128, 0.1);
            color: var(--vscode-charts-grey);
        }
        
        .connection-status-unknown .connection-status-icon {
            background-color: var(--vscode-charts-grey);
        }
        
        .diagnostics-button {
            margin-left: auto;
            background: none;
            border: none;
            color: var(--vscode-button-foreground);
            cursor: pointer;
            padding: 2px 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 3px;
            font-size: 12px;
        }
        
        .diagnostics-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
    </style>
</head>
<body>
    <div class="preview-container">
        <div class="preview-header">
            <div class="preview-label">URL:</div>
            <div class="preview-url">${this._previewUrl || 'Not running'}</div>
            ${this._activeFile ? `<div class="file-badge">${fileTypeDisplay}</div>` : ''}
            <div class="toolbar">
                <button class="toolbar-button" id="refresh-button" title="Refresh Preview">
                    <span class="toolbar-button-icon">$(refresh)</span>
                    Refresh
                </button>
                <button class="toolbar-button" id="open-browser-button" title="Open in Browser">
                    <span class="toolbar-button-icon">$(globe)</span>
                    Browser
                </button>
            </div>
        </div>
        
        <div class="device-selector">
            <button class="device-button active" data-width="100%" data-height="100%" title="Responsive/Full">
                Auto
            </button>
            <button class="device-button" data-width="375px" data-height="667px" title="iPhone SE">
                Mobile
            </button>
            <button class="device-button" data-width="768px" data-height="1024px" title="iPad">
                Tablet
            </button>
            <button class="device-button" data-width="1280px" data-height="720px" title="Laptop">
                Laptop
            </button>
            <button class="device-button" data-width="1400px" data-height="800px" title="Large desktop">
                Large
            </button>
        </div>
        <div class="preview-frame-container">
            ${this._previewUrl
                ? `<iframe class="preview-frame" src="${this._previewUrl}?v=${this._refreshCounter}" 
                    sandbox="allow-scripts allow-forms allow-same-origin allow-modals allow-downloads" 
                    allow="clipboard-write; clipboard-read"
                    referrerpolicy="no-referrer"></iframe>
                  <div class="preview-overlay" id="loading-overlay">
                    <div class="preview-spinner">$(sync~spin)</div>
                    <div>Loading...</div>
                  </div>`
                : `<div class="placeholder">No preview available. Open an HTML, CSS, JS, or TS file and start the preview.</div>`
            }
        </div>
    </div>
    
    <div class="resize-handle" id="resize-handle"></div>
    
    <div class="output-container">
        <div class="output-header">
            <div class="output-title">
                <span class="codicon codicon-terminal"></span>
                <span style="margin-left: 5px;">Server Output</span>
            </div>
            <button class="clear-button" id="clear-output-button">Clear</button>
        </div>
        <div class="output-console" id="output-console">
            ${outputHtml || '<div class="placeholder">No output yet</div>'}
        </div>
    </div>
    
    <div class="diagnostics-bar">
        <div class="connection-status ${connectionStatusClass}">
            <div class="connection-status-icon"></div>
            ${connectionStatusText}
        </div>
        
        <button class="diagnostics-button" id="diagnostics-button">
            <span class="codicon codicon-info"></span>
            Diagnostics
        </button>
    </div>

    <script nonce="${nonce}">
        (function() {
            const vscode = acquireVsCodeApi();
            
            // DOM Elements
            const refreshButton = document.getElementById('refresh-button');
            const openBrowserButton = document.getElementById('open-browser-button');
            const clearOutputButton = document.getElementById('clear-output-button');
            const outputConsole = document.getElementById('output-console');
            const loadingOverlay = document.getElementById('loading-overlay');
            const resizeHandle = document.getElementById('resize-handle');
            const deviceButtons = document.querySelectorAll('.device-button');
            const iframe = document.querySelector('.preview-frame');
            const diagnosticsButton = document.getElementById('diagnostics-button');
            
            // Show loading overlay when iframe starts loading
            if (iframe) {
                loadingOverlay.classList.add('visible');
                
                iframe.addEventListener('load', () => {
                    loadingOverlay.classList.remove('visible');
                });
                
                // Add message listener to track connection status
                try {
                    iframe.addEventListener('load', () => {
                        setTimeout(() => {
                            try {
                                // Check if we can access the iframe's contentWindow
                                if (iframe.contentWindow) {
                                    vscode.postMessage({ 
                                        command: 'connectionStatus', 
                                        status: 'connected'
                                    });
                                }
                            } catch (e) {
                                vscode.postMessage({ 
                                    command: 'connectionStatus', 
                                    status: 'error'
                                });
                            }
                        }, 1000);
                    });
                } catch (e) {
                    console.error('Error setting up iframe message listener:', e);
                }
            }
            
            // Safe DOM update helper function
            function setElementContent(element, content, asHtml = false) {
                if (!element) return;
                
                if (asHtml) {
                    // For cases where we need HTML (use carefully)
                    // First clear the element
                    while (element.firstChild) {
                        element.removeChild(element.firstChild);
                    }
                    
                    // Create a document fragment from the sanitized HTML
                    const template = document.createElement('template');
                    
                    // Sanitize content - simple version
                    const sanitized = content
                        .replace(/javascript:/gi, '')
                        .replace(/data:/gi, '')
                        .replace(/on\\w+=/gi, '');
                        
                    template.innerHTML = sanitized;
                    element.appendChild(template.content);
                } else {
                    // For text content - safer option
                    element.textContent = content;
                }
            }
            
            // Refresh button
            refreshButton?.addEventListener('click', () => {
                // Notify extension to refresh
                vscode.postMessage({ command: 'refresh' });
                
                // Show loading overlay
                if (loadingOverlay) {
                    loadingOverlay.classList.add('visible');
                }
                
                // Reload iframe if it exists
                if (iframe) {
                    iframe.src = iframe.src;
                }
            });
            
            // Open in browser button
            openBrowserButton?.addEventListener('click', () => {
                vscode.postMessage({ command: 'openInBrowser' });
            });
            
            // Clear output button
            clearOutputButton?.addEventListener('click', () => {
                // Use safe DOM manipulation
                if (outputConsole) {
                    while (outputConsole.firstChild) {
                        outputConsole.removeChild(outputConsole.firstChild);
                    }
                }
                
                // Notify extension
                vscode.postMessage({ command: 'clearOutput' });
            });
            
            // Resize handle
            let startY = 0;
            let startHeight = 0;
            
            if (resizeHandle) {
                resizeHandle.addEventListener('mousedown', (e) => {
                    startY = e.clientY;
                    startHeight = document.querySelector('.output-container').offsetHeight;
                    document.addEventListener('mousemove', handleMouseMove);
                    document.addEventListener('mouseup', handleMouseUp);
                    e.preventDefault();
                });
            }
            
            function handleMouseMove(e) {
                const container = document.querySelector('.output-container');
                const delta = startY - e.clientY;
                container.style.maxHeight = '';
                container.style.height = startHeight + delta + 'px';
            }
            
            function handleMouseUp() {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            }
            
            // Device buttons
            deviceButtons.forEach(button => {
                button.addEventListener('click', () => {
                    // Remove active class from all buttons
                    deviceButtons.forEach(btn => btn.classList.remove('active'));
                    
                    // Set active class on clicked button
                    button.classList.add('active');
                    
                    // Apply to iframe container
                    const container = document.querySelector('.preview-frame-container');
                    if (container && iframe) {
                        const width = button.dataset.width;
                        const height = button.dataset.height;
                        
                        if (width === '100%') {
                            iframe.style.width = '100%';
                            iframe.style.height = '100%';
                            iframe.style.margin = '0';
                            iframe.style.transform = 'none';
                            iframe.style.border = 'none';
                            container.style.overflow = 'hidden';
                        } else {
                            iframe.style.width = width;
                            iframe.style.height = height;
                            iframe.style.margin = '20px auto';
                            iframe.style.transform = 'none';
                            iframe.style.border = '1px solid var(--vscode-panel-border)';
                            container.style.overflow = 'auto';
                            
                            // Center iframe in container if smaller than container
                            const containerWidth = container.offsetWidth;
                            const containerHeight = container.offsetHeight;
                            const iframeWidth = parseInt(width);
                            const iframeHeight = parseInt(height);
                            
                            if (iframeWidth > containerWidth || iframeHeight > containerHeight) {
                                const scale = Math.min(
                                    (containerWidth - 40) / iframeWidth,
                                    (containerHeight - 40) / iframeHeight
                                );
                                
                                if (scale < 1) {
                                    iframe.style.transform = \`scale(\${scale})\`;
                                    iframe.style.transformOrigin = 'center top';
                                    iframe.style.margin = '20px auto';
                                }
                            }
                        }
                    }
                });
            });
            
            // Handle messages from the extension
            window.addEventListener('message', event => {
                const message = event.data;
                
                switch (message.command) {
                    case 'updateOutput':
                        // Create HTML elements for each line
                        const lines = message.output.split('\\n');
                        lines.forEach(line => {
                            if (!line.trim()) return;
                            
                            const lineElement = document.createElement('div');
                            lineElement.textContent = line;
                            lineElement.className = 'line';
                            
                            // Add appropriate classes
                            if (line.toLowerCase().includes('error') || 
                                line.toLowerCase().includes('exception') ||
                                line.toLowerCase().includes('failed')) {
                                lineElement.classList.add('error');
                            } else if (line.toLowerCase().includes('warn') || 
                                       line.toLowerCase().includes('deprecated')) {
                                lineElement.classList.add('warning');
                            } else if (line.toLowerCase().includes('info') || 
                                      line.toLowerCase().includes('server running')) {
                                lineElement.classList.add('info');
                            }
                            
                            outputConsole.appendChild(lineElement);
                            
                            // Scroll to bottom
                            outputConsole.scrollTop = outputConsole.scrollHeight;
                            
                            // Remove placeholder if present
                            const placeholder = outputConsole.querySelector('.placeholder');
                            if (placeholder) {
                                outputConsole.removeChild(placeholder);
                            }
                        });
                        break;
                    
                    case 'connectionStatus':
                        // Update connection status indicator
                        const statusElement = document.querySelector('.connection-status');
                        if (statusElement) {
                            statusElement.className = 'connection-status connection-status-' + message.status;
                            
                            const statusText = 
                                message.status === 'connected' ? 'Connected' :
                                message.status === 'disconnected' ? 'Disconnected' :
                                message.status === 'error' ? 'Error' :
                                'Unknown';
                            
                            // Update text content safely
                            const textNode = Array.from(statusElement.childNodes).find(node => 
                                node.nodeType === Node.TEXT_NODE
                            );
                            
                            if (textNode) {
                                textNode.textContent = statusText;
                            } else {
                                statusElement.appendChild(document.createTextNode(statusText));
                            }
                        }
                        break;
                }
            });
            
            // Diagnostics button
            diagnosticsButton?.addEventListener('click', () => {
                vscode.postMessage({ command: 'runDiagnostics' });
            });
        })();
    </script>
</body>
</html>`;
  }

  /**
   * Generate a nonce for CSP
   */
  private _getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
} 