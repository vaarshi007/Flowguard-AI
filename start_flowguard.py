"""
Flowguard-AI: One-Click Production Deployment & Launcher Script
Runs the FastAPI Backend Server with SQLite & serves the Clinical Web Dashboard
"""

import uvicorn
import webbrowser
import socket
import sys
import os

# Add backend directory to sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

if __name__ == "__main__":
    local_ip = get_local_ip()
    port = 8000

    print("=" * 65)
    print(" [+] FLOWGUARD-AI CLINICAL DASHBOARD & BACKEND SERVER ")
    print("=" * 65)
    print(f" Local Web Interface  : http://localhost:{port}")
    print(f" Network Access (LAN) : http://{local_ip}:{port}")
    print(f" REST API Health      : http://localhost:{port}/api/health")
    print("=" * 65)
    print(" Launching Browser & Production Server...")
    print(" Press Ctrl+C to stop the server.")
    print("=" * 65)

    # Open browser automatically
    webbrowser.open(f"http://localhost:{port}")

    # Launch Uvicorn Server
    uvicorn.run("backend.server:app", host="0.0.0.0", port=port, reload=False)
