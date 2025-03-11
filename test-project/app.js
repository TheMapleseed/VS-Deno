"use strict";
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
// Deno Live Preview Test Application
// TypeScript functionality for the test project
// DOM Elements
document.addEventListener('DOMContentLoaded', () => {
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
    const dynamicContent = document.getElementById('dynamic-content');
    fetchDataButton?.addEventListener('click', async () => {
        logToConsole('Fetching data...');
        dynamicContent.innerHTML = '<div class="loading">Loading...</div>';
        try {
            // Using setTimeout to simulate a network request
            // In a real application, this would be a fetch call
            setTimeout(() => {
                const data = generateMockData();
                renderDynamicContent(data);
                logToConsole('Data fetched successfully');
            }, 1500);
        }
        catch (error) {
            logToConsole(`Error fetching data: ${error}`);
            dynamicContent.innerHTML = '<div class="error">Error loading data</div>';
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
    const timerElement = document.getElementById('timer');
    function updateTimer() {
        const now = new Date();
        timerElement.textContent = now.toLocaleTimeString();
    }
    // Initial timer update
    updateTimer();
    // Update timer every second
    setInterval(updateTimer, 1000);
    // Log initial message
    logToConsole('Application initialized');
});
//# sourceMappingURL=app.js.map