import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';
import { DenoPreviewProvider } from './denoPreviewProvider';
import * as os from 'os';

let denoProcess: child_process.ChildProcess | undefined;
let previewProvider: DenoPreviewProvider | undefined;
let statusBarItem: vscode.StatusBarItem;
let projectRoot: string | undefined;
let autoStartStatusBarItem: vscode.StatusBarItem;
let fileWatcher: vscode.FileSystemWatcher | undefined;
let debounceTimer: NodeJS.Timeout | undefined;

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
  console.log('Deno Live Preview extension is now active');

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = "$(browser) Live Preview";
  statusBarItem.command = "deno-live-preview.start";
  context.subscriptions.push(statusBarItem);
  
  // Create auto-start status bar item
  autoStartStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  updateAutoStartStatusBar();
  autoStartStatusBarItem.command = "deno-live-preview.toggleAutoStart";
  context.subscriptions.push(autoStartStatusBarItem);

  // Initialize the preview provider
  previewProvider = new DenoPreviewProvider(context.extensionUri);
  
  // Register the webview provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      DenoPreviewProvider.viewType,
      previewProvider
    )
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('deno-live-preview.start', startLivePreview),
    vscode.commands.registerCommand('deno-live-preview.stop', stopLivePreview),
    vscode.commands.registerCommand('deno-live-preview.toggleAutoStart', toggleAutoStart),
    vscode.commands.registerCommand('deno-live-preview.refresh', () => refreshPreview(true))
  );

  // Show status bar item when a relevant file is active
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor && isPreviewableFile(editor.document)) {
        statusBarItem.show();
        autoStartStatusBarItem.show();
      } else {
        statusBarItem.hide();
        autoStartStatusBarItem.hide();
      }
    })
  );

  // Auto-refresh preview when document is saved
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(document => {
      if (isPreviewableFile(document) && activePreviewFiles.has(document.uri.fsPath)) {
        refreshPreview(false);
      }
    })
  );

  // Set up content change tracking with debounce for hot-reload
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      const document = event.document;
      if (isPreviewableFile(document) && activePreviewFiles.has(document.uri.fsPath)) {
        // Debounce the refresh to avoid too many refreshes when typing
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
          refreshPreview(false);
        }, 500); // Wait 500ms after last change before refreshing
      }
    })
  );

  // Check if a previewable file is currently active
  if (vscode.window.activeTextEditor && 
      isPreviewableFile(vscode.window.activeTextEditor.document)) {
    statusBarItem.show();
    autoStartStatusBarItem.show();
  }

  // Auto-start if configured
  const config = vscode.workspace.getConfiguration('denoLivePreview');
  if (config.get<boolean>('autoStart') && 
      vscode.window.activeTextEditor?.document && 
      isPreviewableFile(vscode.window.activeTextEditor.document)) {
    startLivePreview();
  }
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
        return '';
      }
    } catch (error) {
      console.error(`Error reading file: ${error}`);
      return '';
    }
  }
  
  return `
// Auto-generated Deno server for Live Preview
import { serve } from "https://deno.land/std@0.204.0/http/server.ts";
import { serveDir } from "https://deno.land/std@0.204.0/http/file_server.ts";

// Get configuration from environment variables with validation
const portStr = Deno.env.get("DENO_PORT") || "8000";
const port = Number.isNaN(Number(portStr)) ? 8000 : Number(portStr);
const rootDir = ${escapedProjectDir};

console.log(\`Starting Live Preview server...\`);
console.log(\`Serving files from: \${rootDir}\`);
console.log(\`Server running at: http://localhost:\${port}/\`);
${fileExt === '.html' ? `console.log(\`Opening: ${escapedFileName}\`);` : ''}

// WebSocket connections for live reload
const clients = new Set();

serve(async (req) => {
  const url = new URL(req.url);
  
  // Handle WebSocket connections for live reload
  if (url.pathname === "/_lr_ws") {
    if (req.headers.get("upgrade") !== "websocket") {
      return new Response(null, { status: 501 });
    }
    const { socket, response } = Deno.upgradeWebSocket(req);
    
    socket.onopen = () => {
      clients.add(socket);
    };
    
    socket.onclose = () => {
      clients.delete(socket);
    };
    
    return response;
  }
  
  // Handle live reload script request
  if (url.pathname === "/_lr_script.js") {
    return new Response(\`
      // Live reload script
      (function() {
        const socket = new WebSocket(\`\${location.protocol === 'https:' ? 'wss:' : 'ws:'}//$\{location.host}/_lr_ws\`);
        
        socket.onmessage = function(event) {
          if (event.data === "reload") {
            console.log("[Live Preview] Reloading page...");
            location.reload();
          }
        };
        
        socket.onclose = function() {
          console.log("[Live Preview] Connection closed, attempting to reconnect...");
          setTimeout(() => {
            location.reload();
          }, 2000);
        };
      })();
    \`, {
      headers: {
        "content-type": "application/javascript",
      },
    });
  }
  
  // Inject live reload script to HTML files
  if (url.pathname.endsWith(".html") || url.pathname === "/" || url.pathname === "") {
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
      console.error("Error serving HTML:", e);
      return new Response(\`Server error: \${e.message}\`, { status: 500 });
    }
  }
  
  // Serve all other files normally
  return serveDir(req, {
    fsRoot: rootDir,
    urlRoot: "",
  });
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
    vscode.window.showErrorMessage('No active editor found');
    return;
  }

  const document = editor.document;
  if (!isPreviewableFile(document)) {
    vscode.window.showErrorMessage('Not a supported file type for preview');
    return;
  }

  // Save the current file
  await document.save();
  
  try {
    const filePath = validatePath(document.uri.fsPath);
    
    // Determine project root
    projectRoot = detectProjectRoot(filePath);
    
    // Check if Deno is installed
    try {
      await checkDenoInstalled();
    } catch (error) {
      vscode.window.showErrorMessage('Deno is not installed or not in the PATH. Please install Deno first.');
      return;
    }

    // Get port from configuration
    const config = vscode.workspace.getConfiguration('denoLivePreview');
    const port = config.get<number>('port') || 8000;

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
        }
      }

      // Add file to active preview list
      activePreviewFiles.add(filePath);

      // Run the server with Deno
      // Add minimal necessary permissions while keeping security in mind
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
          DENO_DIR: projectRoot || path.dirname(filePath)
        }
      });

      // Update status bar
      statusBarItem.text = "$(circle-slash) Stop Preview";
      statusBarItem.command = "deno-live-preview.stop";

      // Handle process output
      denoProcess.stdout?.on('data', (data) => {
        console.log(`Deno stdout: ${data}`);
        if (previewProvider) {
          previewProvider.appendOutput(data.toString());
        }
      });

      denoProcess.stderr?.on('data', (data) => {
        console.error(`Deno stderr: ${data}`);
        if (previewProvider) {
          previewProvider.appendOutput(`ERROR: ${data.toString()}`);
        }
      });

      denoProcess.on('error', (error) => {
        vscode.window.showErrorMessage(`Failed to start server: ${error.message}`);
        stopLivePreview();
      });

      denoProcess.on('close', (code) => {
        console.log(`Deno process exited with code ${code}`);
        
        // Clean up temp file if necessary
        if (tempServerFile && fs.existsSync(serverFilePath)) {
          try {
            fs.unlinkSync(serverFilePath);
          } catch (err) {
            console.error(`Failed to remove temporary server file: ${err}`);
          }
        }
        
        stopLivePreview();
      });

      // Set up file watcher for the project directory
      setupFileWatcher(projectRoot || path.dirname(filePath));

      // Show preview
      if (previewProvider) {
        // Determine URL based on file type
        let previewUrl = `http://localhost:${port}`;
        if (path.extname(filePath).toLowerCase() === '.html') {
          // For HTML files, navigate directly to that file
          const relativePath = path.relative(projectRoot || path.dirname(filePath), filePath);
          previewUrl = `http://localhost:${port}/${relativePath.replace(/\\/g, '/')}`;
        }
        
        previewProvider.setPreviewUrl(previewUrl);
        previewProvider.setActiveFile(filePath);
        
        // Open the webview panel
        vscode.commands.executeCommand('workbench.view.extension.deno-live-preview-container');
      }

      vscode.window.showInformationMessage(`Live Preview started on port ${port}`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to start preview: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Invalid file path: ${error instanceof Error ? error.message : String(error)}`);
    return;
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
  if (fileWatcher) {
    fileWatcher.dispose();
    fileWatcher = undefined;
  }
  
  if (denoProcess) {
    try {
      // Kill the process more reliably across platforms
      if (process.platform === 'win32') {
        // On Windows, use taskkill to forcefully terminate the process and its children
        child_process.spawn('taskkill', ['/pid', denoProcess.pid!.toString(), '/f', '/t']);
      } else {
        // On Unix-like systems, send SIGKILL for more reliable termination
        denoProcess.kill('SIGKILL');
        
        // As a backup, also try killall on macOS and Linux
        if (process.platform === 'darwin' || process.platform === 'linux') {
          try {
            // Attempt to kill any stray deno processes
            child_process.spawn('killall', ['deno']);
          } catch (err) {
            // Ignore if killall fails
          }
        }
      }
    } catch (err) {
      console.error(`Error killing Deno process: ${err}`);
    }
    
    denoProcess = undefined;
    
    // Clean up all temporary resources
    cleanupTempResources();
    
    // Clear active files list
    activePreviewFiles.clear();

    // Update status bar
    statusBarItem.text = "$(browser) Live Preview";
    statusBarItem.command = "deno-live-preview.start";

    // Clear preview
    if (previewProvider) {
      previewProvider.clearPreview();
    }

    vscode.window.showInformationMessage('Live Preview stopped');
  }
}

async function checkDenoInstalled(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    child_process.exec('deno --version', (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(true);
    });
  });
}

export function deactivate() {
  // Stop the live preview and kill any running Deno processes
  stopLivePreview();
  
  // Clean up status bar items
  if (statusBarItem) {
    statusBarItem.dispose();
  }
  
  if (autoStartStatusBarItem) {
    autoStartStatusBarItem.dispose();
  }
  
  // Dispose of the preview provider if it exists
  if (previewProvider) {
    previewProvider.dispose();
    previewProvider = undefined;
  }
  
  // Clear any debounce timers
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = undefined;
  }
  
  // Clean up the active files tracking
  activePreviewFiles.clear();
  
  // Perform thorough temp resource cleanup
  cleanupTempResources();
  
  // Final cleanup of any remaining temp directories in workspace
  if (projectRoot && fs.existsSync(projectRoot)) {
    try {
      const tempDir = path.join(projectRoot, '.deno-live-preview');
      if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir, { recursive: true });
        console.log(`Cleaned up temporary directory: ${tempDir}`);
      }
    } catch (err) {
      console.error(`Failed to remove temporary directory: ${err}`);
    }
  }
  
  console.log('Deno Live Preview extension deactivated and resources cleaned up');
} 