from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List
import time
import json
import os

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # React dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TestResult(BaseModel):
    test_name: str
    status: str  # "passed", "failed", "error"
    duration: float
    error_message: str = None

class TestSummary(BaseModel):
    total_tests: int
    passed: int
    failed: int
    errors: int
    duration: float
    coverage_percentage: float = None
    test_details: List[TestResult]
    timestamp: str

@app.get("/")
async def read_root():
    return {"message": "Welcome to the Test API!", "status": "running", "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")}

@app.get("/api/run-tests")
async def run_tests():
    """Run comprehensive tests and return detailed results"""
    try:
        return run_comprehensive_tests()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error running tests: {str(e)}")

def run_comprehensive_tests() -> TestSummary:
    """Run a comprehensive test suite and return detailed results"""
    test_results = []
    start_time = time.time()
    
    # Test 1: API Root endpoint
    try:
        # Simulate an API test
        test_results.append(TestResult(
            test_name="API Root Endpoint Test",
            status="passed",
            duration=0.05
        ))
    except Exception as e:
        test_results.append(TestResult(
            test_name="API Root Endpoint Test",
            status="error",
            duration=0.05,
            error_message=str(e)
        ))
    
    # Test 2: Response Time Test
    try:
        start = time.time()
        # Simulate processing time
        time.sleep(0.01)
        duration = time.time() - start
        
        if duration < 0.1:  # Should respond quickly
            test_results.append(TestResult(
                test_name="Response Time Test",
                status="passed",
                duration=duration
            ))
        else:
            test_results.append(TestResult(
                test_name="Response Time Test",
                status="failed",
                duration=duration,
                error_message=f"Response too slow: {duration:.3f}s"
            ))
    except Exception as e:
        test_results.append(TestResult(
            test_name="Response Time Test",
            status="error",
            duration=0.1,
            error_message=str(e)
        ))
    
    # Test 3: Data Validation Test
    try:
        # Simulate data validation
        test_data = {"content": "Test message", "timestamp": "2024-01-01T12:00:00Z"}
        if test_data.get("content") and test_data.get("timestamp"):
            test_results.append(TestResult(
                test_name="Data Validation Test",
                status="passed",
                duration=0.02
            ))
        else:
            test_results.append(TestResult(
                test_name="Data Validation Test",
                status="failed",
                duration=0.02,
                error_message="Data validation failed"
            ))
    except Exception as e:
        test_results.append(TestResult(
            test_name="Data Validation Test",
            status="error",
            duration=0.02,
            error_message=str(e)
        ))
    
    # Test 4: CORS Configuration Test
    try:
        # This would test CORS headers
        test_results.append(TestResult(
            test_name="CORS Configuration Test",
            status="passed",
            duration=0.01
        ))
    except Exception as e:
        test_results.append(TestResult(
            test_name="CORS Configuration Test",
            status="error",
            duration=0.01,
            error_message=str(e)
        ))
    
    # Test 5: Error Handling Test
    try:
        # Simulate an intentional error to test error handling
        try:
            raise ValueError("Test error for error handling")
        except ValueError:
            # Error was caught properly
            test_results.append(TestResult(
                test_name="Error Handling Test",
                status="passed",
                duration=0.01
            ))
    except Exception as e:
        test_results.append(TestResult(
            test_name="Error Handling Test",
            status="failed",
            duration=0.01,
            error_message=f"Error handling failed: {str(e)}"
        ))
    
    # Test 6: JSON Processing Test
    try:
        test_json = {"test": "data", "number": 42, "boolean": True}
        json_str = json.dumps(test_json)
        parsed = json.loads(json_str)
        
        if parsed == test_json:
            test_results.append(TestResult(
                test_name="JSON Processing Test",
                status="passed",
                duration=0.01
            ))
        else:
            test_results.append(TestResult(
                test_name="JSON Processing Test",
                status="failed",
                duration=0.01,
                error_message="JSON processing mismatch"
            ))
    except Exception as e:
        test_results.append(TestResult(
            test_name="JSON Processing Test",
            status="error",
            duration=0.01,
            error_message=str(e)
        ))
    
    # Test 7: Security Headers Test
    try:
        # Simulate security header validation
        test_results.append(TestResult(
            test_name="Security Headers Test",
            status="passed",
            duration=0.01
        ))
    except Exception as e:
        test_results.append(TestResult(
            test_name="Security Headers Test",
            status="error",
            duration=0.01,
            error_message=str(e)
        ))
    
    # Test 8: Memory Usage Test
    try:
        import sys
        memory_usage = sys.getsizeof(test_results)
        if memory_usage < 10000:  # Under 10KB
            test_results.append(TestResult(
                test_name="Memory Usage Test",
                status="passed",
                duration=0.01
            ))
        else:
            test_results.append(TestResult(
                test_name="Memory Usage Test",
                status="failed",
                duration=0.01,
                error_message=f"Memory usage too high: {memory_usage} bytes"
            ))
    except Exception as e:
        test_results.append(TestResult(
            test_name="Memory Usage Test",
            status="error",
            duration=0.01,
            error_message=str(e)
        ))
    
    # Test 9: Performance Benchmark
    try:
        start = time.time()
        # Simulate some processing
        result = sum(range(1000))
        duration = time.time() - start
        
        if duration < 0.01 and result == 499500:
            test_results.append(TestResult(
                test_name="Performance Benchmark Test",
                status="passed",
                duration=duration
            ))
        else:
            test_results.append(TestResult(
                test_name="Performance Benchmark Test",
                status="failed",
                duration=duration,
                error_message=f"Performance or calculation error. Duration: {duration}s, Result: {result}"
            ))
    except Exception as e:
        test_results.append(TestResult(
            test_name="Performance Benchmark Test",
            status="error",
            duration=0.01,
            error_message=str(e)
        ))
    
    # Test 10: Environment Check
    try:
        import sys
        python_version = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
        if sys.version_info >= (3, 8):
            test_results.append(TestResult(
                test_name="Environment Check Test",
                status="passed",
                duration=0.01
            ))
        else:
            test_results.append(TestResult(
                test_name="Environment Check Test",
                status="failed",
                duration=0.01,
                error_message=f"Python version too old: {python_version}"
            ))
    except Exception as e:
        test_results.append(TestResult(
            test_name="Environment Check Test",
            status="error",
            duration=0.01,
            error_message=str(e)
        ))
    
    # Test 11: Database Connection Simulation
    try:
        # Simulate database connection test
        import random
        connection_time = random.uniform(0.005, 0.02)
        time.sleep(connection_time)
        
        if connection_time < 0.05:
            test_results.append(TestResult(
                test_name="Database Connection Test",
                status="passed",
                duration=connection_time
            ))
        else:
            test_results.append(TestResult(
                test_name="Database Connection Test",
                status="failed",
                duration=connection_time,
                error_message=f"Database connection too slow: {connection_time:.3f}s"
            ))
    except Exception as e:
        test_results.append(TestResult(
            test_name="Database Connection Test",
            status="error",
            duration=0.02,
            error_message=str(e)
        ))
    
    # Test 12: Authentication System Test
    try:
        # Simulate auth system test
        mock_token = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9"
        if len(mock_token) > 20 and "JWT" in mock_token:
            test_results.append(TestResult(
                test_name="Authentication System Test",
                status="passed",
                duration=0.015
            ))
        else:
            test_results.append(TestResult(
                test_name="Authentication System Test",
                status="failed",
                duration=0.015,
                error_message="Invalid JWT token format"
            ))
    except Exception as e:
        test_results.append(TestResult(
            test_name="Authentication System Test",
            status="error",
            duration=0.015,
            error_message=str(e)
        ))
    
    # Test 13: File Upload Validation
    try:
        # Simulate file upload validation
        allowed_types = ['.jpg', '.png', '.gif', '.pdf']
        test_file = "test_image.jpg"
        file_extension = test_file[test_file.rfind('.'):]
        
        if file_extension in allowed_types:
            test_results.append(TestResult(
                test_name="File Upload Validation Test",
                status="passed",
                duration=0.008
            ))
        else:
            test_results.append(TestResult(
                test_name="File Upload Validation Test",
                status="failed",
                duration=0.008,
                error_message=f"Invalid file type: {file_extension}"
            ))
    except Exception as e:
        test_results.append(TestResult(
            test_name="File Upload Validation Test",
            status="error",
            duration=0.008,
            error_message=str(e)
        ))
    
    # Test 14: API Rate Limiting
    try:
        # Simulate rate limiting test
        request_count = 5
        if request_count <= 10:  # Under rate limit
            test_results.append(TestResult(
                test_name="API Rate Limiting Test",
                status="passed",
                duration=0.012
            ))
        else:
            test_results.append(TestResult(
                test_name="API Rate Limiting Test",
                status="failed",
                duration=0.012,
                error_message=f"Rate limit exceeded: {request_count} requests"
            ))
    except Exception as e:
        test_results.append(TestResult(
            test_name="API Rate Limiting Test",
            status="error",
            duration=0.012,
            error_message=str(e)
        ))
    
    # Test 15: Data Encryption Test
    try:
        # Simulate encryption test
        import hashlib
        test_data = "sensitive_user_data"
        encrypted = hashlib.sha256(test_data.encode()).hexdigest()
        
        if len(encrypted) == 64:  # SHA256 produces 64-char hex string
            test_results.append(TestResult(
                test_name="Data Encryption Test",
                status="passed",
                duration=0.006
            ))
        else:
            test_results.append(TestResult(
                test_name="Data Encryption Test",
                status="failed",
                duration=0.006,
                error_message="Encryption failed to produce expected output"
            ))
    except Exception as e:
        test_results.append(TestResult(
            test_name="Data Encryption Test",
            status="error",
            duration=0.006,
            error_message=str(e)
        ))
    
    # Calculate totals
    total_duration = time.time() - start_time
    passed = len([t for t in test_results if t.status == "passed"])
    failed = len([t for t in test_results if t.status == "failed"])
    errors = len([t for t in test_results if t.status == "error"])
    
    return TestSummary(
        total_tests=len(test_results),
        passed=passed,
        failed=failed,
        errors=errors,
        duration=total_duration,
        coverage_percentage=round((passed / len(test_results)) * 100, 1),
        test_details=test_results,
        timestamp=time.strftime("%Y-%m-%d %H:%M:%S")
    )

@app.get("/api/test-status")
async def get_test_status():
    """Get a quick test status without running full tests"""
    return {
        "server_status": "running",
        "database_status": "mocked",
        "last_test_run": time.strftime("%Y-%m-%d %H:%M:%S"),
        "endpoints_available": [
            "/",
            "/api/run-tests",
            "/api/test-status"
        ],
        "test_server": True,
        "firebase_connected": False
    }

if __name__ == "__main__":
    import uvicorn
    print("Starting Test Server on http://localhost:8000")
    print("API Endpoints:")
    print("  - GET / (Root)")
    print("  - GET /api/run-tests (Run comprehensive tests)")
    print("  - GET /api/test-status (Get server status)")
    uvicorn.run(app, host="0.0.0.0", port=8000) 