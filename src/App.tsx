import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import { CartProvider } from './hooks/useCart';
import TestPerformanceService from './services/testPerformanceService';

function App() {
  useEffect(() => {
    // Initialize automatic testing service on app startup
    // Note: The actual test runner will be set up when the ApplicationTestModal loads
    console.log('🚀 Application started - Test Performance Service initialized');
  }, []);

  return (
    <CartProvider>
      <Router>
        <div className="min-h-screen bg-gray-100">
          <Routes>
            <Route path="/" element={<Home />} />
          </Routes>
        </div>
      </Router>
    </CartProvider>
  );
}

export default App; 