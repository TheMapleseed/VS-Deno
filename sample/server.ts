// A simple Deno HTTP server for testing the VS Code Live Preview extension
import { serve } from "https://deno.land/std@0.204.0/http/server.ts";

// Get port from environment variable (set by the extension) or default to 8000
const port = Number(Deno.env.get("DENO_PORT") || "8000");

// Request handler
const handler = (req: Request): Response => {
  const url = new URL(req.url);
  
  // Serve HTML for root path
  if (url.pathname === "/" || url.pathname === "") {
    return new Response(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Deno Live Preview</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
              max-width: 800px;
              margin: 0 auto;
              padding: 2rem;
              line-height: 1.6;
            }
            h1 {
              color: #6c5ce7;
              text-align: center;
            }
            .time {
              font-size: 1.2rem;
              text-align: center;
              margin: 2rem 0;
              padding: 1rem;
              background-color: #dfe6e9;
              border-radius: 4px;
            }
            .reload {
              display: block;
              margin: 0 auto;
              padding: 0.5rem 1rem;
              background-color: #6c5ce7;
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-size: 1rem;
            }
            .reload:hover {
              background-color: #5b4cdb;
            }
            .info {
              margin-top: 2rem;
              padding: 1rem;
              background-color: #f7f7f7;
              border-radius: 4px;
            }
          </style>
        </head>
        <body>
          <h1>Hello from Deno!</h1>
          <div class="time">
            The current time is: <strong>${new Date().toLocaleTimeString()}</strong>
          </div>
          <button class="reload" onclick="location.reload()">Refresh</button>
          <div class="info">
            <p>This is a sample Deno server for testing the VS Code Deno Live Preview extension.</p>
            <p>Edit this file and restart the preview to see your changes.</p>
            <p>Server is running on port: ${port}</p>
          </div>
          <script>
            // Auto-refresh the page every 10 seconds
            setTimeout(() => {
              location.reload();
            }, 10000);
          </script>
        </body>
      </html>
    `, {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    });
  }
  
  // API endpoint that returns JSON
  if (url.pathname === "/api/time") {
    return new Response(JSON.stringify({
      time: new Date().toISOString(),
      timestamp: Date.now()
    }), {
      headers: {
        "content-type": "application/json",
      },
    });
  }
  
  // Return 404 for all other routes
  return new Response("Not found", { status: 404 });
};

// Log server start information
console.log(`Starting Deno HTTP server...`);
console.log(`Server running at: http://localhost:${port}/`);

// Start the server
await serve(handler, { port }); 