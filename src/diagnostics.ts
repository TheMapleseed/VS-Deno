import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { Logger, DiagnosticStatus } from './logger';

/**
 * Helper class for diagnosing issues with Deno Live Preview
 */
export class DiagnosticHelper {
  private logger: Logger;
  
  constructor() {
    this.logger = Logger.getInstance();
  }
  
  /**
   * Run a complete diagnostic check on the extension environment
   */
  public async runSystemCheck(projectPath?: string): Promise<DiagnosticStatus> {
    this.logger.info('Running system diagnostic check');
    
    const diagnostics: Partial<DiagnosticStatus> = {};
    
    // Check if Deno is installed
    diagnostics.denoInstalled = await this.checkDenoInstalled();
    
    // Check network connectivity
    diagnostics.networkAvailable = await this.checkNetworkConnectivity();
    
    // Check file system access
    diagnostics.fileSystemAccess = await this.checkFileSystemAccess(projectPath);
    
    // Check port availability
    const port = this.getConfiguredPort();
    diagnostics.portInUse = await this.isPortInUse(port);
    
    // Check project structure if path provided
    if (projectPath) {
      diagnostics.projectStructure = await this.analyzeProjectStructure(projectPath);
    }
    
    // Update diagnostics in logger
    this.logger.updateDiagnostics(diagnostics);
    
    return this.logger.getDiagnostics();
  }
  
  /**
   * Check if Deno is installed and accessible
   */
  public async checkDenoInstalled(): Promise<boolean> {
    this.logger.debug('Checking if Deno is installed');
    
    return new Promise<boolean>((resolve) => {
      child_process.exec('deno --version', (error) => {
        if (error) {
          this.logger.error('Deno is not installed or not found in PATH', error);
          resolve(false);
        } else {
          this.logger.debug('Deno is installed and accessible');
          resolve(true);
        }
      });
    });
  }
  
  /**
   * Check network connectivity
   */
  public async checkNetworkConnectivity(): Promise<boolean> {
    this.logger.debug('Checking network connectivity');
    
    // Try to connect to a known reliable server (Google's DNS)
    return new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      
      // Set a timeout of 5 seconds
      socket.setTimeout(5000);
      
      socket.on('connect', () => {
        socket.destroy();
        this.logger.debug('Network connectivity available');
        resolve(true);
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        this.logger.warn('Network connection timed out');
        resolve(false);
      });
      
      socket.on('error', (error) => {
        this.logger.error('Network connectivity check failed', error);
        resolve(false);
      });
      
      socket.connect(53, '8.8.8.8');
    });
  }
  
  /**
   * Check file system access
   */
  public async checkFileSystemAccess(projectPath?: string): Promise<boolean> {
    const testDir = projectPath || os.tmpdir();
    const testFile = path.join(testDir, '.deno-preview-test-file');
    
    this.logger.debug(`Checking file system access at ${testDir}`);
    
    try {
      // Try to write to a test file
      fs.writeFileSync(testFile, 'test content');
      
      // Try to read from the test file
      const content = fs.readFileSync(testFile, 'utf8');
      
      // Clean up
      fs.unlinkSync(testFile);
      
      const success = content === 'test content';
      
      if (success) {
        this.logger.debug('File system access check passed');
      } else {
        this.logger.warn('File system access check failed - content mismatch');
      }
      
      return success;
    } catch (error) {
      this.logger.error('File system access check failed', error);
      return false;
    }
  }
  
  /**
   * Check if a port is in use
   */
  public async isPortInUse(port: number): Promise<boolean> {
    this.logger.debug(`Checking if port ${port} is in use`);
    
    return new Promise<boolean>((resolve) => {
      const server = net.createServer();
      
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          this.logger.warn(`Port ${port} is already in use`);
          resolve(true);
        } else {
          this.logger.error(`Error checking port ${port}`, err);
          resolve(false); // Assume not in use for other errors
        }
      });
      
      server.once('listening', () => {
        server.close(() => {
          this.logger.debug(`Port ${port} is available`);
          resolve(false);
        });
      });
      
      server.listen(port, '127.0.0.1');
    });
  }
  
  /**
   * Get configured port from VS Code settings
   */
  private getConfiguredPort(): number {
    const config = vscode.workspace.getConfiguration('denoLivePreview');
    return config.get<number>('port') || 8000;
  }
  
  /**
   * Analyze project structure and check for common issues
   */
  public async analyzeProjectStructure(projectPath: string): Promise<'valid' | 'invalid' | 'unknown'> {
    this.logger.debug(`Analyzing project structure at ${projectPath}`);
    
    try {
      if (!fs.existsSync(projectPath)) {
        this.logger.error(`Project path does not exist: ${projectPath}`);
        return 'invalid';
      }
      
      const files = fs.readdirSync(projectPath);
      
      // Check for empty project
      if (files.length === 0) {
        this.logger.warn(`Project directory is empty: ${projectPath}`);
        return 'invalid';
      }
      
      // Look for common web files
      const hasHtml = files.some(file => file.endsWith('.html'));
      const hasIndexHtml = files.includes('index.html');
      const hasJs = files.some(file => file.endsWith('.js'));
      const hasTs = files.some(file => file.endsWith('.ts'));
      const hasCss = files.some(file => file.endsWith('.css'));
      
      // Check if assets folder exists
      const hasAssetsDir = files.includes('assets') && 
        fs.statSync(path.join(projectPath, 'assets')).isDirectory();
      
      // Determine if this is a valid web project
      const isValidWebProject = hasHtml || hasJs || hasTs;
      
      if (isValidWebProject) {
        this.logger.debug('Project structure appears valid for web content');
        
        // Log detailed project information
        this.logger.debug('Project structure analysis:', {
          hasHtml,
          hasIndexHtml,
          hasJs,
          hasTs,
          hasCss,
          hasAssetsDir,
          totalFiles: files.length,
          files: files.slice(0, 10) // Log first 10 files for inspection
        });
        
        return 'valid';
      } else {
        this.logger.warn('Project structure may not be suitable for web content', {
          hasHtml,
          hasIndexHtml,
          hasJs,
          hasTs,
          hasCss
        });
        
        // Still usable, but flagged as questionable
        return 'unknown';
      }
    } catch (error) {
      this.logger.error('Error analyzing project structure', error);
      return 'unknown';
    }
  }
  
  /**
   * Check WebSocket connectivity from the server
   */
  public updateWebSocketStatus(status: 'connected' | 'disconnected' | 'error' | 'unknown'): void {
    this.logger.debug(`WebSocket status updated: ${status}`);
    this.logger.updateDiagnostics({ websocketStatus: status });
  }
  
  /**
   * Update server running status
   */
  public updateServerStatus(running: boolean): void {
    this.logger.debug(`Server status updated: ${running ? 'running' : 'stopped'}`);
    this.logger.updateDiagnostics({ serverRunning: running });
  }
  
  /**
   * Log process termination details
   */
  public logProcessExit(code: number | null, signal: NodeJS.Signals | null): void {
    if (code === 0) {
      this.logger.info('Server process exited successfully');
    } else {
      this.logger.error(`Server process exited with code ${code}, signal: ${signal}`);
    }
  }
} 