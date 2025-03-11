import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Manages webview panel for Deno live preview
 */
export class DenoPreviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'deno-live-preview.preview';
  
  private _view?: vscode.WebviewView;
  private _previewUrl: string = '';
  private _outputLines: string[] = [];
  private _extensionUri: vscode.Uri;
  private _activeFile: string = '';
  private _activeFileType: string = '';

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
      
      // Restrict the webview to only load resources from the extension's directory
      localResourceRoots: [this._extensionUri]
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
    
    this._updateWebviewContent();
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
    
    const csp = `default-src 'none'; img-src ${webview.cspSource} https:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; frame-src ${frameAncestors} http://localhost:* https:;`;

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
    <style>
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
        }
        
        .preview-label {
            font-weight: bold;
            margin-right: 10px;
        }
        
        .preview-url {
            flex: 1;
            color: var(--vscode-textLink-foreground);
            user-select: text;
            cursor: text;
        }
        
        .file-badge {
            margin-left: 10px;
            padding: 2px 6px;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 4px;
            font-size: 0.8em;
        }
        
        .refresh-button {
            background: none;
            border: none;
            color: var(--vscode-button-foreground);
            cursor: pointer;
            padding: 2px 6px;
            margin-left: 10px;
        }
        
        .refresh-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .preview-frame-container {
            flex: 1;
            overflow: hidden;
            background: white;
        }
        
        .preview-frame {
            width: 100%;
            height: 100%;
            border: none;
        }
        
        .output-container {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-height: 100px;
        }
        
        .output-header {
            display: flex;
            padding: 8px;
            background-color: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
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
    </style>
</head>
<body>
    <div class="preview-container">
        <div class="preview-header">
            <div class="preview-label">Preview URL:</div>
            <div class="preview-url">${this._previewUrl || 'Not running'}</div>
            ${fileTypeDisplay ? `<div class="file-badge">${fileTypeDisplay}</div>` : ''}
            <button id="refresh-button" class="refresh-button" title="Refresh preview">$(refresh)</button>
        </div>
        <div class="preview-frame-container">
            ${this._previewUrl
              ? `<iframe class="preview-frame" src="${this._previewUrl}" sandbox="allow-scripts allow-forms allow-same-origin" allow="clipboard-read; clipboard-write;"></iframe>`
              : `<div class="placeholder">No preview available. Start Deno preview to see content here.</div>`
            }
        </div>
    </div>
    <div class="resize-handle" id="resize-handle"></div>
    <div class="output-container">
        <div class="output-header">
            <div class="preview-label">Console Output</div>
            <div>${fileInfo}</div>
        </div>
        <div class="output-console">
            ${outputHtml || '<div class="placeholder">No output yet</div>'}
        </div>
    </div>

    <script nonce="${nonce}">
        // Script for handling refresh and other interactions
        const vscode = acquireVsCodeApi();
        
        // Handle refresh button click
        document.getElementById('refresh-button').addEventListener('click', () => {
            const iframe = document.querySelector('.preview-frame');
            if (iframe) {
                iframe.src = iframe.src;
            }
        });
        
        // Setup resizable panels
        const resizeHandle = document.getElementById('resize-handle');
        const previewContainer = document.querySelector('.preview-container');
        const outputContainer = document.querySelector('.output-container');
        
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