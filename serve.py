#!/usr/bin/env python3
"""
Simple HTTP server to serve the Status of Professors application.
This avoids CORS issues when loading local files.

Usage:
    python serve.py

Then open http://localhost:8000 in your browser.
"""

import http.server
import socketserver
import os

PORT = 8000

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Add CORS headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
        print(f"✓ Server started at http://localhost:{PORT}")
        print(f"✓ Open http://localhost:{PORT}/index.html in your browser")
        print(f"✓ Or http://localhost:{PORT}/admin.html for admin page")
        print("\nPress Ctrl+C to stop the server")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\nServer stopped.")
