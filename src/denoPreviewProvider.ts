import * as vscode from 'vscode';
import * as path from 'path';

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

  constructor(private readonly extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
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

    this._updateWebviewContent();
  }

  /**
   * Set the active file being previewed
   */
  public setActiveFile(filePath: string) {
    this._activeFile = filePath;
    this._activeFileType = path.extname(filePath).toLowerCase();
    this._updateWebviewContent();
  }

  /**
   * Set the URL for the preview iframe
   */
  public setPreviewUrl(url: string) {
    this._previewUrl = url;
    this._updateWebviewContent();
  }

  /**
   * Refresh the preview
   */
  public refreshPreview() {
    this._refreshCounter++;
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
    
    // Limit the number of lines (keep last 100)
    if (this._outputLines.length > 100) {
      this._outputLines = this._outputLines.slice(-100);
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
    this._previewUrl = '';
    this._outputLines = [];
    this._activeFile = '';
    this._activeFileType = '';
    this._updateWebviewContent();
  }

  /**
   * Dispose of resources used by the preview provider
   */
  public dispose() {
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
   * Get the HTML for the webview content
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
      connect-src http://localhost:* ws://localhost:* wss://localhost:*;
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
      const isError = line.toLowerCase().includes('error');
      return `<div class="line${isError ? ' error' : ''}">${escaped}</div>`;
    }).join('');

    // Get active file info for display
    const fileInfo = this._activeFile ? path.basename(this._activeFile) : 'Not running';
    const fileTypeDisplay = this._activeFileType ? this._activeFileType.substring(1).toUpperCase() : '';

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
            cursor: pointer;
            padding: 2px 8px;
            margin: 0 2px;
            border-radius: 3px;
            font-size: 11px;
        }
        
        .device-button.active {
            background-color: var(--vscode-button-background);
        }
        
        .device-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
    </style>
</head>
<body>
    <div class="preview-container">
        <div class="preview-header">
            <div class="preview-label">URL:</div>
            <div class="preview-url" title="${this._previewUrl}">${this._previewUrl || 'Not running'}</div>
            ${fileTypeDisplay ? `<div class="file-badge">${fileTypeDisplay}</div>` : ''}
            <div class="toolbar">
                <button id="refresh-button" class="toolbar-button" title="Refresh preview">
                    <span class="toolbar-button-icon">$(refresh)</span>
                    Refresh
                </button>
                <button id="open-browser-button" class="toolbar-button" title="Open in browser">
                    <span class="toolbar-button-icon">$(link-external)</span>
                    Browser
                </button>
            </div>
        </div>
        <div class="device-selector">
            <button class="device-button active" data-width="100%" data-height="100%" title="Responsive view">Responsive</button>
            <button class="device-button" data-width="375px" data-height="667px" title="iPhone SE">Mobile</button>
            <button class="device-button" data-width="768px" data-height="1024px" title="iPad">Tablet</button>
            <button class="device-button" data-width="1280px" data-height="800px" title="Desktop">Desktop</button>
            <button class="device-button" data-width="1400px" data-height="800px" title="Large desktop">Large</button>
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
                : `<div class="placeholder">No preview available. Start Live Preview to see content here.</div>`
            }
        </div>
    </div>
    <div class="resize-handle" id="resize-handle"></div>
    <div class="output-container">
        <div class="output-header">
            <div class="output-title">
                <div class="preview-label">Console Output</div>
                <div>${fileInfo}</div>
            </div>
            <button class="clear-button" id="clear-output-button">Clear</button>
        </div>
        <div class="output-console" id="output-console">
            ${outputHtml || '<div class="placeholder">No output yet</div>'}
        </div>
    </div>

    <script nonce="${nonce}">
        // Script for handling refresh and other interactions
        const vscode = acquireVsCodeApi();
        
        // Elements
        const refreshButton = document.getElementById('refresh-button');
        const openBrowserButton = document.getElementById('open-browser-button');
        const clearOutputButton = document.getElementById('clear-output-button');
        const iframe = document.querySelector('.preview-frame');
        const outputConsole = document.getElementById('output-console');
        const loadingOverlay = document.getElementById('loading-overlay');
        const resizeHandle = document.getElementById('resize-handle');
        const previewContainer = document.querySelector('.preview-container');
        const outputContainer = document.querySelector('.output-container');
        const deviceButtons = document.querySelectorAll('.device-button');
        
        // Show loading overlay when iframe starts loading
        if (iframe) {
            loadingOverlay.classList.add('visible');
            
            iframe.addEventListener('load', () => {
                loadingOverlay.classList.remove('visible');
            });
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
                    .replace(/on\w+=/gi, '');
                    
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
                
                const placeholder = document.createElement('div');
                placeholder.className = 'placeholder';
                placeholder.textContent = 'No output yet';
                outputConsole.appendChild(placeholder);
            }
        });

        // Handle messages from the extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
                case 'output':
                    if (outputConsole && message.text) {
                        const line = document.createElement('div');
                        line.className = message.text.toLowerCase().includes('error') ? 'line error' : 'line';
                        line.textContent = message.text;
                        
                        if (outputConsole.querySelector('.placeholder')) {
                            outputConsole.innerHTML = '';
                        }
                        
                        outputConsole.appendChild(line);
                        // Auto-scroll to bottom
                        outputConsole.scrollTop = outputConsole.scrollHeight;
                    }
                    break;
                case 'clearOutput':
                    if (outputConsole) {
                        while (outputConsole.firstChild) {
                            outputConsole.removeChild(outputConsole.firstChild);
                        }
                    }
                    break;
            }
        });

        // Device emulation
        deviceButtons.forEach(button => {
            button.addEventListener('click', () => {
                // Reset active state
                deviceButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                // Get dimensions from data attributes
                const width = button.dataset.width || 'auto';
                const height = button.dataset.height || 'auto';
                
                // Apply to iframe container
                document.querySelector('.preview-frame-container').style.width = width;
                document.querySelector('.preview-frame-container').style.height = height;
            });
        });

        // Implement resizable panels
        let startY, startHeightTop, startHeightBottom;
        
        resizeHandle.addEventListener('mousedown', (e) => {
            startY = e.clientY;
            startHeightTop = previewContainer.offsetHeight;
            startHeightBottom = outputContainer.offsetHeight;
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });
        
        function handleMouseMove(e) {
            const deltaY = e.clientY - startY;
            const newHeightTop = startHeightTop + deltaY;
            const newHeightBottom = startHeightBottom - deltaY;
            
            if (newHeightTop > 100 && newHeightBottom > 50) {
                previewContainer.style.flex = 'none';
                outputContainer.style.flex = 'none';
                previewContainer.style.height = newHeightTop + 'px';
                outputContainer.style.height = newHeightBottom + 'px';
            }
        }
        
        function handleMouseUp() {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        }
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