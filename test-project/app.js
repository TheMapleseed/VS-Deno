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

// Deno Live Preview Test Application
// JavaScript functionality for the test project

// Global error handler
window.onerror = function(message, source, lineno, colno, error) {
  logError({
    message: message,
    source: source,
    lineno: lineno,
    colno: colno,
    stack: error ? error.stack : 'No stack trace available'
  });
  return false; // Let the default error handler run as well
};

// Error logging system
let errorLog = [];

function logError(errorInfo) {
  const timestamp = new Date().toISOString();
  const errorEntry = {
    timestamp: timestamp,
    ...errorInfo
  };
  
  errorLog.push(errorEntry);
  renderErrorLog();
}

function renderErrorLog() {
  const errorLogElement = document.getElementById('error-log');
  if (!errorLogElement) return;
  
  errorLogElement.innerHTML = '';
  
  if (errorLog.length === 0) {
    errorLogElement.innerHTML = '<div class="no-errors">No errors logged</div>';
    return;
  }
  
  errorLog.forEach((error, index) => {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-entry';
    
    const timePart = new Date(error.timestamp).toLocaleTimeString();
    
    errorDiv.innerHTML = `
      <div class="error-timestamp">${timePart}</div>
      <div class="error-message">${error.message}</div>
      <div class="error-location">at ${error.source}:${error.lineno}:${error.colno}</div>
      <pre class="error-stack">${error.stack || 'No stack trace'}</pre>
    `;
    
    errorLogElement.appendChild(errorDiv);
  });
}

function clearErrors() {
  errorLog = [];
  renderErrorLog();
}

function copyErrorsToClipboard() {
  if (errorLog.length === 0) {
    alert('No errors to copy');
    return;
  }
  
  const errorText = errorLog.map(error => {
    return `[${new Date(error.timestamp).toLocaleTimeString()}] ${error.message}
  at ${error.source}:${error.lineno}:${error.colno}
  Stack: ${error.stack || 'No stack trace'}
`;
  }).join('\n');
  
  navigator.clipboard.writeText(errorText).then(() => {
    alert('Errors copied to clipboard');
  }).catch(err => {
    console.error('Failed to copy errors: ', err);
  });
}

// DOM Elements
document.addEventListener('DOMContentLoaded', () => {
  // Setup error log controls
  const clearErrorsBtn = document.getElementById('clear-errors');
  const copyErrorsBtn = document.getElementById('copy-errors');
  
  clearErrorsBtn?.addEventListener('click', clearErrors);
  copyErrorsBtn?.addEventListener('click', copyErrorsToClipboard);
  
  // Initialize error log display
  renderErrorLog();

  // Theme Toggle
  const themeToggle = document.getElementById('theme-toggle');
  const body = document.body;
  
  themeToggle?.addEventListener('click', () => {
    body.classList.toggle('dark-theme');
    themeToggle.textContent = body.classList.contains('dark-theme') 
      ? 'Switch to Light Theme' 
      : 'Switch to Dark Theme';
    
    logToConsole('Theme changed to ' + (body.classList.contains('dark-theme') ? 'dark' : 'light'));
  });
  
  // Console Output
  const consoleOutput = document.getElementById('console-output');
  
  function logToConsole(message) {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.innerHTML = `<span class="timestamp">[${timestamp}]</span> ${message}`;
    consoleOutput?.appendChild(logEntry);
    
    // Auto-scroll to bottom
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  }
  
  // Add Item Functionality
  const addItemInput = document.getElementById('add-item-input');
  const addItemButton = document.getElementById('add-item-button');
  const itemsList = document.getElementById('items-list');
  
  addItemButton?.addEventListener('click', () => {
    addItem();
  });
  
  addItemInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addItem();
    }
  });
  
  function addItem() {
    const itemText = addItemInput.value.trim();
    if (itemText) {
      const li = document.createElement('li');
      li.textContent = itemText;
      
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Delete';
      deleteBtn.className = 'delete-btn';
      deleteBtn.addEventListener('click', () => {
        li.remove();
        logToConsole(`Item "${itemText}" removed`);
      });
      
      li.appendChild(deleteBtn);
      itemsList?.appendChild(li);
      
      addItemInput.value = '';
      logToConsole(`Item "${itemText}" added`);
    }
  }
  
  // Fetch Data Button
  const fetchDataButton = document.getElementById('fetch-data');
  const dynamicContent = document.getElementById('dynamic-container');
  
  fetchDataButton?.addEventListener('click', () => {
    logToConsole('Fetching data...');
    dynamicContent.innerHTML = '<div class="loading">Loading...</div>';
    
    try {
      // Using setTimeout to simulate a network request
      setTimeout(() => {
        const data = generateMockData();
        renderDynamicContent(data);
        logToConsole('Data fetched successfully');
      }, 1500);
    } catch (error) {
      logToConsole(`Error fetching data: ${error}`);
      dynamicContent.innerHTML = '<div class="error">Error loading data</div>';
      
      // Log to the error console
      logError({
        message: `Error fetching data: ${error.message}`,
        source: 'app.js',
        lineno: 0,
        colno: 0,
        stack: error.stack
      });
    }
  });
  
  function generateMockData() {
    return [
      { id: 1, title: 'Deno', description: 'A secure runtime for JavaScript and TypeScript' },
      { id: 2, title: 'TypeScript', description: 'JavaScript with syntax for types' },
      { id: 3, title: 'VS Code', description: 'Code editing redefined' },
      { id: 4, title: 'Live Preview', description: 'Real-time preview as you edit' }
    ];
  }
  
  function renderDynamicContent(items) {
    dynamicContent.innerHTML = '';
    
    const grid = document.createElement('div');
    grid.className = 'content-grid';
    
    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <h3>${item.title}</h3>
        <p>${item.description}</p>
      `;
      grid.appendChild(card);
    });
    
    dynamicContent.appendChild(grid);
  }
  
  // Update Timer
  const secondsElement = document.getElementById('seconds');
  const currentTimeElement = document.getElementById('current-time');
  
  function updateTimer() {
    const now = new Date();
    currentTimeElement.textContent = now.toLocaleTimeString();
  }
  
  // Count seconds
  let seconds = 0;
  function incrementSeconds() {
    seconds++;
    secondsElement.textContent = seconds.toString();
  }
  
  // Initial timer update
  updateTimer();
  
  // Update timer every second
  setInterval(updateTimer, 1000);
  setInterval(incrementSeconds, 1000);
  
  // Add a "trigger error" button for testing
  const triggerErrorBtn = document.createElement('button');
  triggerErrorBtn.textContent = 'Trigger Test Error';
  triggerErrorBtn.className = 'btn';
  triggerErrorBtn.style.backgroundColor = '#d90429';
  triggerErrorBtn.addEventListener('click', () => {
    // Deliberately cause an error
    try {
      const nonExistentFunction = undefined;
      nonExistentFunction(); // This will throw an error
    } catch (error) {
      // This error will be caught by our handler and logged
      throw new Error('This is a test error');
    }
  });
  
  // Add the test error button to the control panel
  const controlPanel = document.querySelector('.control-panel');
  controlPanel?.appendChild(triggerErrorBtn);
  
  // Log initial message
  logToConsole('Application initialized');
}); 