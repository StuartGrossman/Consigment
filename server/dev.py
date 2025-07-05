#!/usr/bin/env python3
"""
Development server with auto-restart functionality
Run this script to start the server with automatic reloading
"""

import subprocess
import sys
import os
import signal
import time
from pathlib import Path
from watchfiles import watch

def run_server():
    """Start the uvicorn server"""
    print("🚀 Starting FastAPI server with auto-reload...")
    cmd = [
        sys.executable, "-m", "uvicorn", 
        "main:app", 
        "--host", "0.0.0.0", 
        "--port", "8002",
        "--reload",
        "--log-level", "info"
    ]
    
    return subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        universal_newlines=True,
        bufsize=1
    )

def kill_server(process):
    """Gracefully kill the server process"""
    if process and process.poll() is None:
        print("🛑 Stopping server...")
        try:
            process.terminate()
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            print("⚠️  Force killing server...")
            process.kill()
            process.wait()

def main():
    """Main development server runner"""
    print("🔧 Summit Gear Exchange - Development Server")
    print("📁 Watching for changes in Python files...")
    print("⏹️  Press Ctrl+C to stop\n")
    
    server_process = None
    
    def signal_handler(signum, frame):
        print("\n📊 Shutting down development server...")
        kill_server(server_process)
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        # Start initial server
        server_process = run_server()
        
        # Print server output in real-time
        def print_output():
            try:
                for line in iter(server_process.stdout.readline, ''):
                    if line:
                        print(line.rstrip())
                    if server_process.poll() is not None:
                        break
            except Exception as e:
                print(f"Output error: {e}")
        
        # Start output printing in background
        import threading
        output_thread = threading.Thread(target=print_output, daemon=True)
        output_thread.start()
        
        # Watch for file changes
        watch_paths = [
            Path('.'),  # Current directory (server files)
        ]
        
        # Files to watch
        patterns = ['*.py', '*.json', '*.yaml', '*.yml']
        
        print(f"👀 Watching: {', '.join(patterns)} in {os.getcwd()}")
        print("🔄 Server will auto-restart on file changes\n")
        
        for changes in watch(*watch_paths, recursive=True):
            # Filter for Python files and config files
            relevant_changes = []
            for change_type, file_path in changes:
                if any(Path(file_path).match(pattern) for pattern in patterns):
                    # Skip __pycache__ and .pyc files
                    if '__pycache__' not in str(file_path) and not str(file_path).endswith('.pyc'):
                        relevant_changes.append((change_type, file_path))
            
            if relevant_changes:
                print(f"\n🔄 File changes detected:")
                for change_type, file_path in relevant_changes:
                    print(f"   {change_type.name}: {Path(file_path).name}")
                
                print("🔄 Restarting server...\n")
                
                # Kill existing server
                kill_server(server_process)
                time.sleep(1)  # Brief pause
                
                # Start new server
                server_process = run_server()
                
                # Restart output thread
                output_thread = threading.Thread(target=print_output, daemon=True)
                output_thread.start()
    
    except KeyboardInterrupt:
        print("\n📊 Development server stopped by user")
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        kill_server(server_process)

if __name__ == "__main__":
    main() 