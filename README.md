# Deno Live Preview

A Visual Studio Code extension that provides live preview capability for Deno TypeScript files, HTML, and CSS.

## Features

- **Complete Web Application Preview**: Run and preview Deno TypeScript, HTML, and CSS files with a single click
- **Smart Project Detection**: Automatically identifies project structure and serves all related files
- **Live Preview**: View your web application in an embedded webview with automatic refresh
- **Console Output**: See all console messages and errors directly in the preview panel
- **Resizable Interface**: Adjust the size of the preview and console sections as needed
- **Auto-start Option**: Automatically start the preview when opening supported files (optional)

## Requirements

- [Deno](https://deno.land/) must be installed and available in your PATH
- For TypeScript files, using Deno's standard library is recommended (but not required)

## Extension Settings

This extension contributes the following settings:

* `denoLivePreview.port`: The port to use for the Deno server (default: 8000)
* `denoLivePreview.autoStart`: Automatically start the preview when opening a supported file (default: false)

## Usage

### For HTML and CSS Files

1. Open an HTML or CSS file
2. Click the "Start Deno Live Preview" button in the status bar
3. The extension will automatically:
   - Detect the project structure
   - Create a temporary Deno server to serve the HTML/CSS and related files
   - Display a live preview in the panel
4. Edit your HTML/CSS files and refresh the preview to see changes

### For TypeScript Files

1. Open a TypeScript file
2. Click the "Start Deno Live Preview" button
3. If your file contains Deno HTTP server code, it will be run directly
4. If not, the extension will create a temporary server to serve your file and project

### Preview Panel

The preview panel offers several features:
- Live view of your web application
- Console output showing server logs and errors
- File badge indicating the type of file being previewed
- Refresh button to reload the preview
- Resizable interface to adjust the preview and console sections

### Example Deno TypeScript Server

```typescript
// server.ts
import { serve } from "https://deno.land/std/http/server.ts";

const port = Number(Deno.env.get("DENO_PORT") || "8000");
const handler = (req: Request): Response => {
  const url = new URL(req.url);
  
  if (url.pathname === "/") {
    return new Response(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Deno Live Preview</title>
        </head>
        <body>
          <h1>Hello from Deno!</h1>
          <p>The time is: ${new Date().toLocaleTimeString()}</p>
        </body>
      </html>
    `, {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    });
  }
  
  return new Response("Not found", { status: 404 });
};

console.log(`HTTP server running on http://localhost:${port}`);
await serve(handler, { port });
```

## Known Issues

- The extension requires Deno to be installed, even for HTML/CSS files
- Hot reloading is not automatic - you need to click refresh to see changes

## Release Notes

### 1.0.0

Initial release of Deno Live Preview with support for TypeScript, HTML, and CSS files

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This extension is licensed under the MIT License. 