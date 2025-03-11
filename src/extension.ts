import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';
import { DenoPreviewProvider } from './denoPreviewProvider';

let denoProcess: child_process.ChildProcess | undefined;
let previewProvider: DenoPreviewProvider | undefined;
let statusBarItem: vscode.StatusBarItem;
let projectRoot: string | undefined;
let autoStartStatusBarItem: vscode.StatusBarItem;

// Track open preview for different file types
let activePreviewFiles: Set<string> = new Set();

export function activate(context: vscode.ExtensionContext) {
  console.log('Deno Live Preview extension is now active');

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = "$(play) Deno Live Preview";
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
    vscode.commands.registerCommand('deno-live-preview.toggleAutoStart', toggleAutoStart)
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

// Update the auto-start status bar based on current configuration
function updateAutoStartStatusBar() {
  const config = vscode.workspace.getConfiguration('denoLivePreview');
  const autoStart = config.get<boolean>('autoStart') || false;
  autoStartStatusBarItem.text = autoStart ? "$(check) Auto-Start: On" : "$(x) Auto-Start: Off";
  autoStartStatusBarItem.tooltip = `Click to ${autoStart ? 'disable' : 'enable'} auto-start for Deno Live Preview`;
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
  vscode.window.showInformationMessage(`Deno Live Preview auto-start ${newState}`);
}

// Check if a file is eligible for preview
function isPreviewableFile(document: vscode.TextDocument): boolean {
  const fileType = document.languageId.toLowerCase();
  return fileType === 'typescript' || fileType === 'html' || fileType === 'css';
}

// Detect the root directory containing the project files
function detectProjectRoot(filePath: string): string {
  // Start with the directory containing the file
  let dir = path.dirname(filePath);
  
  // Look for common project markers
  while (dir !== path.parse(dir).root) {
    // Check for package.json, deno.json, or index.html as indicators of project root
    if (fs.existsSync(path.join(dir, 'package.json')) ||
        fs.existsSync(path.join(dir, 'deno.json')) ||
        fs.existsSync(path.join(dir, 'index.html'))) {
      return dir;
    }
    
    // Move up one directory
    dir = path.dirname(dir);
  }
  
  // If no project markers found, return the directory of the file
  return path.dirname(filePath);
}

// Generate a simple static server based on the file type and project structure
function generateStaticServerCode(filePath: string): string {
  const fileExt = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);
  const projectDir = projectRoot || path.dirname(filePath);
  
  // If it's a TS file that already has server code, don't generate anything
  if (fileExt === '.ts' && fs.readFileSync(filePath, 'utf8').includes('serve(')) {
    return '';
  }
  
  return `
// Auto-generated Deno server for static file preview
import { serve } from "https://deno.land/std@0.204.0/http/server.ts";
import { serveDir } from "https://deno.land/std@0.204.0/http/file_server.ts";

const port = Number(Deno.env.get("DENO_PORT") || "8000");
const rootDir = "${projectDir.replace(/\\/g, '\\\\')}";

console.log(\`Starting Deno static file server for Live Preview...\`);
console.log(\`Serving files from: \${rootDir}\`);
console.log(\`Server running at: http://localhost:\${port}/\`);
${fileExt === '.html' ? `console.log(\`Opening: ${fileName}\`);` : ''}

await serve((req) => {
  const url = new URL(req.url);
  
  // Handle file specifically requested in the preview
  ${fileExt === '.html' ? `
  if (url.pathname === "/" || url.pathname === "") {
    return serveDir(req, {
      fsRoot: rootDir,
      urlRoot: "",
      showIndex: false,
      showDirListing: false,
      quiet: true,
      headers: {
        "cache-control": "no-cache, no-store, must-revalidate",
      }
    });
  }
  ` : `
  // Serve all static files from the project directory
  return serveDir(req, {
    fsRoot: rootDir,
    urlRoot: "",
    showIndex: true,
    showDirListing: false,
    quiet: true,
    headers: {
      "cache-control": "no-cache, no-store, must-revalidate",
    }
  });
  `}
}, { port });
`;
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
  const filePath = document.uri.fsPath;
  
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

    // For HTML or CSS files, or TS files without server code, create a temporary server
    if (fileType === '.html' || fileType === '.css' || 
        (fileType === '.ts' && !fs.readFileSync(filePath, 'utf8').includes('serve('))) {
      const serverCode = generateStaticServerCode(filePath);
      if (serverCode) {
        // Create temporary server file
        const tempDir = path.join(projectRoot || path.dirname(filePath), '.deno-live-preview');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        serverFilePath = path.join(tempDir, '_temp_server.ts');
        fs.writeFileSync(serverFilePath, serverCode, 'utf8');
        tempServerFile = true;
      }
    }

    // Add file to active preview list
    activePreviewFiles.add(filePath);

    // Run the server with Deno
    denoProcess = child_process.spawn('deno', [
      'run',
      '--allow-net',
      '--allow-read',
      '--allow-env',
      serverFilePath
    ], {
      env: { 
        ...process.env, 
        DENO_PORT: port.toString(),
        DENO_DIR: projectRoot || path.dirname(filePath)
      }
    });

    // Update status bar
    statusBarItem.text = "$(stop) Stop Deno Preview";
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
      vscode.window.showErrorMessage(`Failed to start Deno: ${error.message}`);
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

    vscode.window.showInformationMessage(`Deno preview started on port ${port}`);
  } catch (error) {
    if (error instanceof Error) {
      vscode.window.showErrorMessage(`Failed to start Deno preview: ${error.message}`);
    } else {
      vscode.window.showErrorMessage(`Failed to start Deno preview: ${String(error)}`);
    }
  }
}

function stopLivePreview() {
  if (denoProcess) {
    // Kill the process
    if (process.platform === 'win32') {
      child_process.spawn('taskkill', ['/pid', denoProcess.pid!.toString(), '/f', '/t']);
    } else {
      denoProcess.kill('SIGTERM');
    }
    denoProcess = undefined;
    
    // Clear active files list
    activePreviewFiles.clear();

    // Update status bar
    statusBarItem.text = "$(play) Deno Live Preview";
    statusBarItem.command = "deno-live-preview.start";

    // Clear preview
    if (previewProvider) {
      previewProvider.clearPreview();
    }

    vscode.window.showInformationMessage('Deno preview stopped');
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
  stopLivePreview();
} 