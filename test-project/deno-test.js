/**
 * Deno Live Preview Test Project
 * Copyright (C) 2023
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

// Deno-specific test functionality
// This file tests Deno-specific APIs and features

// Function to test if running in Deno environment
function checkDenoEnvironment() {
  const errorLogElement = document.getElementById('error-log');
  const resultElement = document.getElementById('deno-test-result');
  
  try {
    // Check if Deno global exists
    if (typeof Deno !== 'undefined') {
      // Running in Deno environment
      const version = Deno.version;
      
      const denoInfo = {
        version: version,
        build: Deno.build,
        permissions: {
          read: checkPermission('read'),
          write: checkPermission('write'),
          net: checkPermission('net'),
          env: checkPermission('env'),
          run: checkPermission('run'),
          ffi: checkPermission('ffi')
        }
      };
      
      if (resultElement) {
        resultElement.innerHTML = `
          <div class="success-message">
            <h3>✅ Deno Environment Detected</h3>
            <pre>${JSON.stringify(denoInfo, null, 2)}</pre>
          </div>
        `;
      }
      
      return true;
    } else {
      // Not running in Deno
      if (resultElement) {
        resultElement.innerHTML = `
          <div class="error-message">
            <h3>❌ Not Running in Deno</h3>
            <p>This page is not being served by Deno.</p>
            <p>The Deno global object is not available, suggesting that the Live Preview extension might not be using Deno to serve this content.</p>
          </div>
        `;
      }
      
      // Log to error console for easier sharing
      if (typeof logError === 'function') {
        logError({
          message: 'Deno environment not detected',
          source: 'deno-test.js',
          lineno: 0,
          colno: 0,
          stack: 'Deno global is undefined. The extension might not be using Deno to serve this content.'
        });
      }
      
      return false;
    }
  } catch (error) {
    // Error occurred during detection
    if (resultElement) {
      resultElement.innerHTML = `
        <div class="error-message">
          <h3>❌ Error Detecting Deno Environment</h3>
          <p>An error occurred while trying to detect Deno:</p>
          <pre>${error.message}\n${error.stack || ''}</pre>
        </div>
      `;
    }
    
    // Log to error console for easier sharing
    if (typeof logError === 'function') {
      logError({
        message: `Error detecting Deno environment: ${error.message}`,
        source: 'deno-test.js',
        lineno: 0,
        colno: 0,
        stack: error.stack
      });
    }
    
    return false;
  }
}

// Helper function to check a specific permission
function checkPermission(permissionName) {
  try {
    const status = Deno.permissions.querySync({ name: permissionName });
    return status.state;
  } catch (error) {
    return `Error: ${error.message}`;
  }
}

// Load on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  const denoTestBtn = document.getElementById('test-deno-btn');
  
  if (denoTestBtn) {
    denoTestBtn.addEventListener('click', checkDenoEnvironment);
  } else {
    // Create the button if it doesn't exist
    const controlPanel = document.querySelector('.control-panel');
    if (controlPanel) {
      const denoTestBtn = document.createElement('button');
      denoTestBtn.id = 'test-deno-btn';
      denoTestBtn.textContent = 'Test Deno Environment';
      denoTestBtn.className = 'btn';
      denoTestBtn.style.backgroundColor = '#5A45FF'; // Deno color
      
      denoTestBtn.addEventListener('click', checkDenoEnvironment);
      controlPanel.appendChild(denoTestBtn);
    }
  }
  
  // Create a result container if it doesn't exist
  if (!document.getElementById('deno-test-result')) {
    const mainElement = document.querySelector('main');
    if (mainElement) {
      const denoTestSection = document.createElement('section');
      denoTestSection.className = 'deno-test';
      
      denoTestSection.innerHTML = `
        <h2>Deno Runtime Test</h2>
        <p>This section tests whether the page is being served by the Deno runtime.</p>
        <p>Click the "Test Deno Environment" button in the control panel to check.</p>
        <div id="deno-test-result" class="test-result-container">
          <p>No test has been run yet.</p>
        </div>
      `;
      
      mainElement.appendChild(denoTestSection);
    }
  }
}); 