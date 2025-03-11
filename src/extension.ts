import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';
import { DenoPreviewProvider } from './denoPreviewProvider';
import * as os from 'os';
import { Logger } from './logger';
import { DiagnosticHelper } from './diagnostics';

// Initialize logger
const logger = Logger.getInstance();
const diagnostics = new DiagnosticHelper();

let denoProcess: child_process.ChildProcess | undefined;
let previewProvider: DenoPreviewProvider | undefined;
let statusBarItem: vscode.StatusBarItem;
let projectRoot: string | undefined;
let autoStartStatusBarItem: vscode.StatusBarItem;
let fileWatcher: vscode.FileSystemWatcher | undefined;
let debounceTimer: NodeJS.Timeout | undefined;
let diagnosticsButton: vscode.StatusBarItem;

// Track open preview for different file types
let activePreviewFiles: Set<string> = new Set();

// Add a map to track temporary files and directories
const tempResources = new Map<string, { type: 'file' | 'directory', path: string }>();

/**
 * Validates a file path to ensure it doesn't contain potentially malicious components
 * @param filePath The file path to validate
 * @returns Sanitized absolute path
 */
function validatePath(filePath: string): string {
  try {
    // Normalize the path to resolve '..' and '.' segments
    const normalizedPath = path.normalize(filePath);
    
    // Convert to absolute path to eliminate relative path attacks
    const absolutePath = path.resolve(normalizedPath);
    
    // Check if the file exists and is within workspace or temp/safe directories
    if (fs.existsSync(absolutePath)) {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders && workspaceFolders.length > 0) {
        // If the file is in any workspace folder, it's safe
        const isWithinWorkspace = workspaceFolders.some(folder => 
          absolutePath.startsWith(folder.uri.fsPath)
        );
        
        // If it's not in workspace, verify it's in a system temp dir or project dir
        if (!isWithinWorkspace) {
          const isTempDir = absolutePath.includes(os.tmpdir());
          const isInProjectDir = projectRoot ? absolutePath.startsWith(projectRoot) : false;
          
          // Only reject if it's outside both workspace, temp dir and project dir
          if (!isTempDir && !isInProjectDir) {
            console.warn(`Path outside workspace detected: ${absolutePath}. Using it anyway as it may be required.`);
          }
        }
      }
    }
    
    return absolutePath;
  } catch (error) {
    console.error(`Path validation error: ${error}`);
    // Return the original path if validation fails - this is important for functionality
    return path.resolve(filePath);
  }
}

export function activate(context: vscode.ExtensionContext) {
  logger.info('Activating Deno Live Preview extension');
  
  // Run initial system check
  diagnostics.runSystemCheck().then(status => {
    logger.info('Initial diagnostic status:', status);
  });

  // Create an instance of the preview provider
  previewProvider = new DenoPreviewProvider(context.extensionUri);
  
  // Register the webview provider
  const previewViewProvider = vscode.window.registerWebviewViewProvider(
    DenoPreviewProvider.viewType,
    previewProvider,
    {
      webviewOptions: {
        retainContextWhenHidden: true,
      }
    }
  );
  
  // Create status bar items
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = "$(play) Start Preview";
  statusBarItem.command = "deno-live-preview.start";
  statusBarItem.tooltip = "Start Deno Live Preview";
  statusBarItem.show();
  
  autoStartStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  updateAutoStartStatusBar();
  autoStartStatusBarItem.show();
  
  // Create diagnostics button in status bar
  diagnosticsButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
  diagnosticsButton.text = "$(shield) Deno Diagnostics";
  diagnosticsButton.command = "deno-live-preview.showDiagnostics";
  diagnosticsButton.tooltip = "Show Deno Live Preview Diagnostics";
  diagnosticsButton.show();

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('deno-live-preview.start', startLivePreview),
    vscode.commands.registerCommand('deno-live-preview.stop', stopLivePreview),
    vscode.commands.registerCommand('deno-live-preview.refresh', () => refreshPreview(true)),
    vscode.commands.registerCommand('deno-live-preview.toggleAutoStart', toggleAutoStart),
    vscode.commands.registerCommand('deno-live-preview.showDiagnostics', showDiagnostics),
    vscode.commands.registerCommand('deno-live-preview.runTroubleshooter', runTroubleshooter),
    previewViewProvider,
    statusBarItem,
    autoStartStatusBarItem,
    diagnosticsButton
  );
  
  // Add document change listener for auto-refresh
  vscode.workspace.onDidSaveTextDocument((document) => {
    // Only refresh preview if auto-refresh is enabled
    const config = vscode.workspace.getConfiguration('denoLivePreview');
    if (config.get<boolean>('autoRefresh', true) && activePreviewFiles.has(document.uri.fsPath)) {
      logger.debug(`Document saved: ${document.uri.fsPath}, triggering refresh`);
      refreshPreview();
    }
  });
  
  // Auto-start preview for active editor if configured
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor && isPreviewableFile(activeEditor.document)) {
    const config = vscode.workspace.getConfiguration('denoLivePreview');
    if (config.get<boolean>('autoStart', false)) {
      logger.debug('Auto-starting preview for active editor');
      startLivePreview();
    }
  }
  
  logger.info('Deno Live Preview extension activated');
}

// Update the preview when changes are detected or manually requested
function refreshPreview(showNotification: boolean = false) {
  if (!previewProvider) return;
  
  if (showNotification) {
    vscode.window.showInformationMessage('Refreshing Live Preview...');
  }
  
  previewProvider.refreshPreview();
}

// Update the auto-start status bar based on current configuration
function updateAutoStartStatusBar() {
  const config = vscode.workspace.getConfiguration('denoLivePreview');
  const autoStart = config.get<boolean>('autoStart') || false;
  autoStartStatusBarItem.text = autoStart ? "$(check) Auto Preview: On" : "$(x) Auto Preview: Off";
  autoStartStatusBarItem.tooltip = `Click to ${autoStart ? 'disable' : 'enable'} auto-start for Live Preview`;
}

// Toggle auto-start setting
async function toggleAutoStart() {
  const config = vscode.workspace.getConfiguration('denoLivePreview');
  const currentValue = config.get<boolean>('autoStart') || false;
  
  // Toggle the value
  await config.update('autoStart', !currentValue, vscode.ConfigurationTarget.Global);
  
  // Update the status bar
  updateAutoStartStatusBar();
  
  // Show confirmation message
  const newState = !currentValue ? 'enabled' : 'disabled';
  vscode.window.showInformationMessage(`Live Preview auto-start ${newState}`);
}

// Check if a file is eligible for preview
function isPreviewableFile(document: vscode.TextDocument): boolean {
  const fileType = document.languageId.toLowerCase();
  return fileType === 'typescript' || fileType === 'html' || fileType === 'css' || fileType === 'javascript';
}

// Detect the root directory containing the project files
function detectProjectRoot(filePath: string): string {
  try {
    // Make sure we're working with a validated path
    const validatedPath = validatePath(filePath);
    let dir = path.dirname(validatedPath);
    
    // Look for common project markers, but limit search depth
    let searchDepth = 0;
    const maxSearchDepth = 10; // Prevent infinite loops
    
    while (dir !== path.parse(dir).root && searchDepth < maxSearchDepth) {
      // Check for package.json, deno.json, or index.html as indicators of project root
      if (fs.existsSync(path.join(dir, 'package.json')) ||
          fs.existsSync(path.join(dir, 'deno.json')) ||
          fs.existsSync(path.join(dir, 'index.html'))) {
        return dir;
      }
      
      // Move up one directory
      dir = path.dirname(dir);
      searchDepth++;
    }
    
    // If no project markers found, return the directory of the file
    return path.dirname(validatedPath);
  } catch (error) {
    console.error(`Error in detectProjectRoot: ${error}`);
    // If we can't detect the project root, fallback to the file's directory
    return path.dirname(filePath);
  }
}

// Generate a simple static server based on the file type and project structure
function generateStaticServerCode(filePath: string): string {
  const fileExt = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);
  
  logger.debug(`Generating static server code for ${filePath} (${fileExt})`);
  
  // Sanitize inputs for use in the generated code
  const projectDir = projectRoot || path.dirname(filePath);
  
  // Make sure our path is properly escaped for use in a string literal
  // Replace backslashes with double backslashes and escape single quotes
  const escapedProjectDir = JSON.stringify(projectDir);
  const escapedFileName = JSON.stringify(fileName);
  
  // If it's a TS file that already has server code, don't generate anything
  if (fileExt === '.ts') {
    try {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      if (fileContent.includes('serve(')) {
        logger.debug('File already contains server code, not generating static server');
        return '';
      }
    } catch (error) {
      logger.error(`Error reading file: ${error}`);
      return '';
    }
  }
  
  logger.debug('Generating static server with WebSocket support and detailed logging');
  
  return `
// Auto-generated Deno server for Live Preview
import { serve } from "https://deno.land/std@0.204.0/http/server.ts";
import { serveDir } from "https://deno.land/std@0.204.0/http/file_server.ts";

// Get configuration from environment variables with validation
const portStr = Deno.env.get("DENO_PORT") || "8000";
const port = Number.isNaN(Number(portStr)) ? 8000 : Number(portStr);
const rootDir = ${escapedProjectDir};
const sourceFile = Deno.env.get("DENO_LIVE_PREVIEW_FILE") || "";

// Enhanced logging
function log(level, message, data) {
  const timestamp = new Date().toISOString();
  console.log(\`[\${timestamp}] [\${level.padEnd(5)}] \${message}\`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

log("INFO", \`Starting Live Preview server...\`);
log("INFO", \`Server version: Deno \${Deno.version.deno}\`);
log("INFO", \`Serving files from: \${rootDir}\`);
log("INFO", \`Server running at: http://localhost:\${port}/\`);
${fileExt === '.html' ? `log("INFO", \`Opening: ${escapedFileName}\`);` : ''}

// Track diagnostics
const diagnostics = {
  startTime: Date.now(),
  connections: 0,
  activeConnections: 0,
  wsConnections: 0,
  activeWsConnections: 0,
  requests: 0,
  errors: 0,
  lastError: null
};

// WebSocket connections for live reload
const clients = new Set();

// Log diagnostics every 10 seconds
const diagnosticsInterval = setInterval(() => {
  log("DEBUG", "Server diagnostics", {
    uptime: Math.round((Date.now() - diagnostics.startTime) / 1000) + "s",
    connections: diagnostics.connections,
    activeConnections: diagnostics.activeConnections,
    wsConnections: diagnostics.wsConnections,
    activeWsConnections: diagnostics.activeWsConnections,
    requests: diagnostics.requests,
    errors: diagnostics.errors,
    lastError: diagnostics.lastError
  });
}, 10000);

// File watcher
let watcher;
try {
  watcher = Deno.watchFs(rootDir);
  log("INFO", \`Watching for file changes in: \${rootDir}\`);
  
  // Handle file changes
  (async () => {
    for await (const event of watcher) {
      if (event.kind === "modify" || event.kind === "create") {
        log("INFO", \`File changed: \${event.paths.join(", ")}\`);
        // Notify all clients to reload
        if (clients.size > 0) {
          log("INFO", \`Notifying \${clients.size} WebSocket clients to reload\`);
          for (const client of clients) {
            if (client.readyState === 1) {
              client.send("reload");
            }
          }
        } else {
          log("WARN", "No active WebSocket clients to notify");
        }
      }
    }
  })();
} catch (err) {
  diagnostics.errors++;
  diagnostics.lastError = \`Error setting up file watcher: \${err}\`;
  log("ERROR", diagnostics.lastError);
}

// Track connections and cleanup on shutdown
Deno.addSignalListener("SIGINT", () => {
  log("INFO", "Shutting down server...");
  clearInterval(diagnosticsInterval);
  if (watcher) {
    watcher.close();
  }
  for (const client of clients) {
    client.close();
  }
  Deno.exit(0);
});

serve(async (req) => {
  diagnostics.requests++;
  diagnostics.connections++;
  diagnostics.activeConnections++;
  
  try {
    const url = new URL(req.url);
    
    // Special diagnostics endpoint
    if (url.pathname === "/_diagnostics") {
      return new Response(JSON.stringify(diagnostics, null, 2), {
        headers: { "content-type": "application/json" }
      });
    }
    
    // Handle WebSocket connections for live reload
    if (url.pathname === "/_lr_ws") {
      diagnostics.wsConnections++;
      diagnostics.activeWsConnections++;
      
      if (req.headers.get("upgrade") !== "websocket") {
        diagnostics.errors++;
        diagnostics.lastError = "WebSocket upgrade required";
        log("ERROR", "WebSocket connection failed - upgrade required");
        return new Response(null, { status: 501 });
      }
      
      try {
        const { socket, response } = Deno.upgradeWebSocket(req);
        
        socket.onopen = () => {
          log("INFO", "WebSocket connection established");
          clients.add(socket);
        };
        
        socket.onmessage = (event) => {
          log("DEBUG", \`WebSocket message received: \${event.data}\`);
        };
        
        socket.onclose = () => {
          log("INFO", "WebSocket connection closed");
          clients.delete(socket);
          diagnostics.activeWsConnections--;
        };
        
        socket.onerror = (error) => {
          diagnostics.errors++;
          diagnostics.lastError = \`WebSocket error: \${error}\`;
          log("ERROR", diagnostics.lastError);
          clients.delete(socket);
          diagnostics.activeWsConnections--;
        };
        
        return response;
      } catch (error) {
        diagnostics.errors++;
        diagnostics.lastError = \`WebSocket upgrade error: \${error}\`;
        log("ERROR", diagnostics.lastError);
        return new Response(\`WebSocket error: \${error.message}\`, { status: 500 });
      }
    }
    
    // Handle live reload script request
    if (url.pathname === "/_lr_script.js") {
      log("DEBUG", "Live reload script requested");
      return new Response(\`
        // Live reload script with enhanced error handling
        (function() {
          console.log("[Live Preview] Initializing live reload");
          
          let reconnectAttempts = 0;
          let socket = null;
          
          function connectWebSocket() {
            const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = \\\`\${protocol}//\${location.host}/_lr_ws\\\`;
            
            console.log("[Live Preview] Connecting to WebSocket:", wsUrl);
            
            try {
              socket = new WebSocket(wsUrl);
              
              socket.onopen = function() {
                console.log("[Live Preview] WebSocket connected");
                reconnectAttempts = 0;
                
                // Send diagnostics data to server
                socket.send(JSON.stringify({
                  type: 'connect',
                  url: location.href,
                  userAgent: navigator.userAgent
                }));
              };
              
              socket.onmessage = function(event) {
                console.log("[Live Preview] Received message:", event.data);
                if (event.data === "reload") {
                  console.log("[Live Preview] Reloading page...");
                  location.reload();
                }
              };
              
              socket.onclose = function(event) {
                console.log("[Live Preview] Connection closed, code:", event.code, "reason:", event.reason);
                reconnect();
              };
              
              socket.onerror = function(error) {
                console.error("[Live Preview] WebSocket error:", error);
                reconnect();
              };
            } catch (error) {
              console.error("[Live Preview] Error creating WebSocket:", error);
              reconnect();
            }
          }
          
          function reconnect() {
            if (socket) {
              try {
                socket.close();
              } catch (e) {
                // Ignore errors when closing
              }
              socket = null;
            }
            
            reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), 10000);
            
            console.log("[Live Preview] Reconnecting in", delay, "ms (attempt", reconnectAttempts, ")");
            
            setTimeout(function() {
              connectWebSocket();
            }, delay);
          }
          
          // Check connection status periodically
          setInterval(function() {
            if (socket && socket.readyState > 1) {
              console.log("[Live Preview] Connection appears closed, reconnecting...");
              reconnect();
            }
          }, 5000);
          
          // Start connection
          connectWebSocket();
          
          // Report load success
          console.log("[Live Preview] Live reload initialized successfully");
        })();
      \`, {
        headers: {
          "content-type": "application/javascript",
        },
      });
    }
    
    // Inject live reload script to HTML files
    if (url.pathname.endsWith(".html") || url.pathname === "/" || url.pathname === "") {
      log("DEBUG", \`Serving HTML: \${url.pathname}\`);
      try {
        const response = await serveDir(req, {
          fsRoot: rootDir,
          urlRoot: "",
        });
        
        // Only process HTML responses
        if (response.headers.get("content-type")?.includes("text/html")) {
          const originalText = await response.text();
          
          // Only inject if not already present
          if (!originalText.includes("/_lr_script.js")) {
            log("DEBUG", "Injecting live reload script into HTML response");
            const injectedText = originalText.replace(
              "</head>",
              \`<script src="/_lr_script.js"></script></head>\`
            );
            
            return new Response(injectedText, {
              status: response.status,
              headers: response.headers,
            });
          }
        }
        
        return response;
      } catch (e) {
        diagnostics.errors++;
        diagnostics.lastError = \`Error serving HTML: \${e}\`;
        log("ERROR", diagnostics.lastError);
        return new Response(\`Server error: \${e.message}\`, { status: 500 });
      }
    }
    
    // Serve all other files normally
    log("DEBUG", \`Serving: \${url.pathname}\`);
    const response = await serveDir(req, {
      fsRoot: rootDir,
      urlRoot: "",
    });
    
    return response;
  } catch (error) {
    diagnostics.errors++;
    diagnostics.lastError = \`Unhandled server error: \${error}\`;
    log("ERROR", diagnostics.lastError, error);
    return new Response(\`Server error: \${error.message}\`, { status: 500 });
  } finally {
    diagnostics.activeConnections--;
  }
}, { port });
`;
}

// Improved temporary file management
function createTempResource(basePath: string, suffix: string, content?: string): string {
  try {
    // Ensure base directory exists with secure permissions
    if (!fs.existsSync(basePath)) {
      fs.mkdirSync(basePath, { recursive: true, mode: 0o700 });
      tempResources.set(basePath, { type: 'directory', path: basePath });
    }
    
    // Create a unique file path
    const resourcePath = path.join(basePath, suffix);
    
    // If content provided, write to file with secure permissions
    if (content !== undefined) {
      fs.writeFileSync(resourcePath, content, { mode: 0o600 });
      tempResources.set(resourcePath, { type: 'file', path: resourcePath });
    }
    
    return resourcePath;
  } catch (error) {
    console.error(`Error creating temporary resource: ${error}`);
    throw error;
  }
}

// Function to safely clean up temporary resources
function cleanupTempResources(): void {
  // Process files first, then directories
  // This ensures we don't try to delete directories before their contents
  
  // Delete files
  for (const [key, resource] of tempResources.entries()) {
    if (resource.type === 'file' && fs.existsSync(resource.path)) {
      try {
        fs.unlinkSync(resource.path);
        console.log(`Deleted temporary file: ${resource.path}`);
      } catch (err) {
        console.error(`Failed to delete temporary file ${resource.path}: ${err}`);
      }
      tempResources.delete(key);
    }
  }
  
  // Delete directories
  for (const [key, resource] of tempResources.entries()) {
    if (resource.type === 'directory' && fs.existsSync(resource.path)) {
      try {
        fs.rmdirSync(resource.path, { recursive: true });
        console.log(`Deleted temporary directory: ${resource.path}`);
      } catch (err) {
        console.error(`Failed to delete temporary directory ${resource.path}: ${err}`);
      }
      tempResources.delete(key);
    }
  }
}

async function startLivePreview() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    logger.warn('No active editor found when trying to start preview');
    vscode.window.showErrorMessage('No active editor found');
    return;
  }

  const document = editor.document;
  if (!isPreviewableFile(document)) {
    logger.warn(`File type not supported for preview: ${document.uri.fsPath}`);
    vscode.window.showErrorMessage('Not a supported file type for preview');
    return;
  }

  // Save the current file
  logger.debug('Saving current file before starting preview');
  await document.save();
  
  try {
    const filePath = validatePath(document.uri.fsPath);
    
    // Determine project root
    projectRoot = detectProjectRoot(filePath);
    logger.info(`Starting Live Preview for ${filePath}, project root: ${projectRoot}`);
    
    // Check if Deno is installed
    try {
      const isDenoInstalled = await diagnostics.checkDenoInstalled();
      
      if (!isDenoInstalled) {
        logger.error('Deno is not installed or not found in PATH');
        vscode.window.showErrorMessage('Deno is not installed or not in the PATH. Please install Deno first.');
        return;
      }
    } catch (error) {
      logger.error('Error checking Deno installation', error);
      vscode.window.showErrorMessage('Deno is not installed or not in the PATH. Please install Deno first.');
      return;
    }

    // Run diagnostics on project path
    await diagnostics.runSystemCheck(projectRoot);

    // Get port from configuration
    const config = vscode.workspace.getConfiguration('denoLivePreview');
    const port = config.get<number>('port') || 8000;

    // Check if port is available
    const isPortInUse = await diagnostics.isPortInUse(port);
    if (isPortInUse) {
      logger.warn(`Port ${port} is already in use, might cause issues`);
    }

    // Stop any existing preview
    stopLivePreview();

    try {
      const fileType = path.extname(filePath).toLowerCase();
      let serverFilePath = filePath;
      let tempServerFile = false;

      // For HTML, CSS, JS files, or TS files without server code, create a temporary server
      if (fileType === '.html' || fileType === '.css' || fileType === '.js' || 
          (fileType === '.ts' && !fs.readFileSync(filePath, 'utf8').includes('serve('))) {
        const serverCode = generateStaticServerCode(filePath);
        if (serverCode) {
          // Create a temporary directory and server file using our secure method
          const tempDir = path.join(projectRoot || path.dirname(filePath), '.deno-live-preview');
          
          // Create the server file in the temporary directory
          serverFilePath = createTempResource(tempDir, '_temp_server.ts', serverCode);
          tempServerFile = true;
          logger.debug(`Created temporary server file at ${serverFilePath}`);
        }
      }

      // Add file to active preview list
      activePreviewFiles.add(filePath);

      // Run the server with Deno
      // Add minimal necessary permissions while keeping security in mind
      logger.info(`Starting Deno process with server file: ${serverFilePath}`);
      denoProcess = child_process.spawn('deno', [
        'run',
        '--allow-net',  // Need full net access for WebSockets
        '--allow-read=' + (projectRoot || path.dirname(filePath)),
        '--allow-env',  // Need environment variables for configuration
        '--unstable',   // Required for some WebSocket features
        serverFilePath
      ], {
        env: { 
          ...process.env, 
          DENO_PORT: port.toString(),
          DENO_DIR: projectRoot || path.dirname(filePath),
          DENO_LIVE_PREVIEW: 'true',
          DENO_LIVE_PREVIEW_FILE: filePath
        }
      });

      // Update status bar
      statusBarItem.text = "$(circle-slash) Stop Preview";
      statusBarItem.command = "deno-live-preview.stop";
      
      // Update diagnostics status
      diagnostics.updateServerStatus(true);

      // Handle process output
      denoProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        logger.debug(`Server stdout: ${output.trim()}`);
        previewProvider?.appendOutput(output);
        
        // Extract server URL from output
        const urlMatch = output.match(/Server running at: (http:\/\/localhost:[0-9]+\/)/);
        if (urlMatch && urlMatch[1]) {
          const serverUrl = urlMatch[1];
          logger.info(`Server started at ${serverUrl}`);
          
          // For HTML files, directly open the file
          if (fileType === '.html') {
            const relativePath = path.relative(projectRoot || path.dirname(filePath), filePath);
            // Ensure URL path separators are correct
            const urlPath = relativePath.split(path.sep).join('/');
            const fullUrl = `${serverUrl}${urlPath}`;
            previewProvider?.setPreviewUrl(fullUrl);
          } else {
            // For other file types, just use the server root
            previewProvider?.setPreviewUrl(serverUrl);
          }
          
          // Set the active file in the preview
          previewProvider?.setActiveFile(filePath);
          
          // Set up file watcher for the project
          if (projectRoot) {
            setupFileWatcher(projectRoot);
          }
        }
      });

      denoProcess.stderr?.on('data', (data) => {
        const errorOutput = data.toString();
        logger.error(`Server stderr: ${errorOutput.trim()}`);
        previewProvider?.appendOutput(errorOutput);
      });

      denoProcess.on('close', (code, signal) => {
        diagnostics.logProcessExit(code, signal);
        previewProvider?.appendOutput(`Server process exited with code ${code}\n`);
        
        // Set status back to stopped
        diagnostics.updateServerStatus(false);
        
        // Clean up temp server file if needed
        if (tempServerFile && fs.existsSync(serverFilePath)) {
          try {
            fs.unlinkSync(serverFilePath);
            logger.debug(`Cleaned up temporary server file: ${serverFilePath}`);
          } catch (e) {
            logger.error(`Failed to clean up temporary server file: ${serverFilePath}`, e);
          }
        }
        
        // Reset status bar if this wasn't a restart
        if (denoProcess === undefined) {
          statusBarItem.text = "$(play) Start Preview";
          statusBarItem.command = "deno-live-preview.start";
        }
      });

      vscode.window.showInformationMessage(`Live Preview started on port ${port}`);
      
    } catch (error) {
      logger.error('Error starting live preview', error);
      vscode.window.showErrorMessage(`Failed to start Live Preview: ${error}`);
    }
  } catch (error) {
    logger.error('Error in Live Preview startup', error);
    vscode.window.showErrorMessage(`Error in Live Preview: ${error}`);
  }
}

// Set up the file watcher for the project
function setupFileWatcher(projectPath: string) {
  // Clean up any existing file watcher
  if (fileWatcher) {
    fileWatcher.dispose();
  }
  
  // Create a new file watcher for all relevant file types
  fileWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(projectPath, '**/*.{html,css,js,ts}')
  );
  
  // Handle file changes (debounced)
  fileWatcher.onDidChange((uri) => {
    // Only reload for files we care about and when the preview is active
    const filePath = uri.fsPath;
    const fileExt = path.extname(filePath).toLowerCase();
    
    if ((fileExt === '.html' || fileExt === '.css' || fileExt === '.js' || fileExt === '.ts') && denoProcess) {
      // Notify the server to reload clients
      try {
        // Send a reload signal to the Deno process
        if (denoProcess && denoProcess.stdin) {
          console.log('Triggering live reload...');
          // This will trigger reload in clients using our injected script
          refreshPreview(false);
        }
      } catch (e) {
        console.error('Error triggering reload:', e);
      }
    }
  });
}

function stopLivePreview() {
  logger.info('Stopping live preview');
  
  if (denoProcess) {
    logger.debug('Terminating Deno process');
    // Kill the process gently first
    denoProcess.kill();
    
    // Set a timeout to force kill if needed
    setTimeout(() => {
      if (denoProcess) {
        try {
          process.kill(denoProcess.pid!);
          logger.debug('Force killed Deno process');
        } catch (e) {
          logger.debug('Process already terminated');
          // Process already gone, ignore
        }
      }
    }, 500);
    
    denoProcess = undefined;
  }
  
  // Stop file watcher
  if (fileWatcher) {
    logger.debug('Disposing file watcher');
    fileWatcher.dispose();
    fileWatcher = undefined;
  }
  
  // Clear the active preview files
  activePreviewFiles.clear();
  
  // Clean up temporary resources
  logger.debug('Cleaning up temporary resources');
  cleanupTempResources();
  
  // Update status bar
  statusBarItem.text = "$(play) Start Preview";
  statusBarItem.command = "deno-live-preview.start";
  
  // Clear the preview provider
  if (previewProvider) {
    logger.debug('Clearing preview provider');
    previewProvider.clearPreview();
  }
  
  // Update server status in diagnostics
  diagnostics.updateServerStatus(false);
  diagnostics.updateWebSocketStatus('disconnected');
  
  // Show notification
  vscode.window.showInformationMessage('Live Preview was stopped');
}

/**
 * Show diagnostics information to the user
 */
function showDiagnostics() {
  logger.debug('Showing diagnostics information to user');
  
  // Run a system check first to update all diagnostics
  diagnostics.runSystemCheck(projectRoot).then(() => {
    logger.showDiagnosticsToUser();
  });
}

/**
 * Run the troubleshooter
 */
function runTroubleshooter() {
  logger.debug('Running troubleshooter');
  
  // Run diagnostics first
  diagnostics.runSystemCheck(projectRoot).then(() => {
    logger.showDiagnosticsToUser();
  });
}

export function deactivate() {
  logger.info('Deactivating Deno Live Preview extension');
  
  // Ensure all processes are stopped
  stopLivePreview();
  
  // Clean up any remaining resources
  cleanupTempResources();
  
  logger.info('Deno Live Preview extension deactivated');
} 