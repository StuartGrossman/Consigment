import React, { useState } from 'react';
import { useRateLimiter } from '../hooks/useRateLimiter';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGoogleLogin: () => Promise<void>;
  onPhoneLogin: (phoneNumber: string, recaptchaContainer?: string) => Promise<string>;
  onVerifyOTP: (code: string) => Promise<void>;
  onResendOTP: () => Promise<string>;
  verificationId: string | null;
}

const LoginModal: React.FC<LoginModalProps> = ({ 
  isOpen, 
  onClose, 
  onGoogleLogin, 
  onPhoneLogin,
  onVerifyOTP,
  onResendOTP,
  verificationId
}) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginMethod, setLoginMethod] = useState<'selection' | 'phone' | 'otp'>('selection');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [phoneCooldown, setPhoneCooldown] = useState(0);
  
  // Rate limiting hook
  const { executeWithRateLimit } = useRateLimiter();

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    const result = await executeWithRateLimit('login', async () => {
      setLoading(true);
      await onGoogleLogin();
      return true;
    });

    if (result.success) {
      onClose();
    } else {
      setError(result.error || 'Login failed. Please try again.');
    }
    setLoading(false);
  };

  const handlePhoneLogin = async () => {
    if (phoneCooldown > 0) {
      setError(`⏰ Please wait ${phoneCooldown} seconds before trying again`);
      return;
    }

    if (!phoneNumber.trim()) {
      setError('Please enter a phone number');
      return;
    }

    // Validate phone number format
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      setError('Please enter a valid 10-digit phone number');
      return;
    }
    
    setError(null);
    setSuccess(null);
    
    const result = await executeWithRateLimit('login', async () => {
      setLoading(true);
      console.log('Starting phone login with:', phoneNumber);
      
      // Store phone number for potential resend
      localStorage.setItem('lastPhoneNumber', `+1${cleanPhone}`);
      
      const verificationId = await onPhoneLogin(phoneNumber, 'recaptcha-container');
      console.log('SMS sent, verification ID:', verificationId);
      return verificationId;
    });

    if (result.success) {
      setSuccess('📱 SMS verification code sent! Please check your phone.');
      setLoginMethod('otp');
      startCountdown(60); // 60 second countdown for resend
    } else {
      const errorMessage = result.error || 'Failed to send SMS. Please try again.';
      setError(errorMessage);
      
      // Implement progressive cooldown for phone attempts
      if (errorMessage.includes('Too many login attempts') || errorMessage.includes('too-many-requests')) {
        startPhoneCooldown(300); // 5 minute cooldown for rate limit errors
      } else if (errorMessage.includes('Daily SMS limit') || errorMessage.includes('quota-exceeded')) {
        startPhoneCooldown(3600); // 1 hour cooldown for quota errors
      } else {
        startPhoneCooldown(30); // 30 second cooldown for other errors
      }
    }
    setLoading(false);
  };

  const handleOTPVerification = async () => {
    if (!otpCode.trim()) {
      setError('Please enter the verification code');
      return;
    }

    if (otpCode.length !== 6) {
      setError('Please enter the complete 6-digit code');
      return;
    }
    
    setError(null);
    
    const result = await executeWithRateLimit('verify', async () => {
      setLoading(true);
      console.log('Verifying OTP code:', otpCode);
      await onVerifyOTP(otpCode);
      console.log('OTP verification successful');
      return true;
    });

    if (result.success) {
      setSuccess('✅ Phone verification successful! Welcome!');
      setTimeout(() => {
        onClose();
        resetForm();
      }, 1500);
    } else {
      setError(result.error || 'Invalid verification code. Please try again.');
    }
    setLoading(false);
  };

  const handleResendOTP = async () => {
    if (countdown > 0) {
      return;
    }

    setError(null);
    setSuccess(null);
    
    const result = await executeWithRateLimit('resend', async () => {
      setLoading(true);
      console.log('Resending OTP...');
      await onResendOTP();
      return true;
    });

    if (result.success) {
      setSuccess('📱 New verification code sent!');
      startCountdown(60); // Reset countdown
    } else {
      setError(result.error || 'Failed to resend code. Please try again.');
    }
    setLoading(false);
  };

  const startCountdown = (seconds: number) => {
    setCountdown(seconds);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const startPhoneCooldown = (seconds: number) => {
    setPhoneCooldown(seconds);
    const timer = setInterval(() => {
      setPhoneCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const resetForm = () => {
    setPhoneNumber('');
    setOtpCode('');
    setLoginMethod('selection');
    setLoading(false);
    setError(null);
    setSuccess(null);
    setCountdown(0);
    setPhoneCooldown(0);
    localStorage.removeItem('lastPhoneNumber');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const formatPhoneNumber = (value: string) => {
    // Remove all non-numeric characters
    const phoneNumber = value.replace(/\D/g, '');
    
    // Format as (XXX) XXX-XXXX
    if (phoneNumber.length <= 3) {
      return phoneNumber;
    } else if (phoneNumber.length <= 6) {
      return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`;
    } else {
      return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhoneNumber(formatted);
  };

  const handleOTPChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, ''); // Only allow digits
    if (value.length <= 6) {
      setOtpCode(value);
    }
  };

  const goBack = () => {
    if (loginMethod === 'otp') {
      setLoginMethod('phone');
      setOtpCode('');
      setError(null);
      setSuccess(null);
    } else if (loginMethod === 'phone') {
      setLoginMethod('selection');
      setPhoneNumber('');
      setError(null);
      setSuccess(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-800">
              {loginMethod === 'selection' && 'Welcome to Summit Gear Exchange'}
              {loginMethod === 'phone' && 'Sign In with Phone'}
              {loginMethod === 'otp' && 'Enter Verification Code'}
            </h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 focus:outline-none"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Selection Screen */}
          {loginMethod === 'selection' && (
            <div className="space-y-4">
              <p className="text-gray-600 text-center mb-6">
                Choose how you'd like to sign in
              </p>

              {/* Google Login Button */}
              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full flex items-center justify-center px-6 py-3 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
              >
                <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">or</span>
                </div>
              </div>

              {/* Phone Number Button */}
              <button
                onClick={() => setLoginMethod('phone')}
                disabled={loading}
                className="w-full flex items-center justify-center px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50 transition-colors"
              >
                <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Continue with Phone Number
              </button>

              <p className="text-xs text-gray-500 text-center mt-4">
                By continuing, you agree to our terms and conditions
              </p>
            </div>
          )}

          {/* Phone Number Entry Screen */}
          {loginMethod === 'phone' && (
            <div className="space-y-4">
              <button
                onClick={goBack}
                className="flex items-center text-gray-600 hover:text-gray-800 text-sm mb-4"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to sign in options
              </button>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  id="phone"
                  value={phoneNumber}
                  onChange={handlePhoneChange}
                  placeholder="(555) 123-4567"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  maxLength={14}
                />
              </div>

              <button
                onClick={handlePhoneLogin}
                disabled={loading || !phoneNumber.trim() || phoneCooldown > 0}
                className="w-full px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Sending SMS...
                  </div>
                ) : phoneCooldown > 0 ? (
                  `Please wait ${phoneCooldown}s`
                ) : (
                  'Send Verification Code'
                )}
              </button>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                <p className="text-sm text-blue-800">
                  <strong>🔐 Secure SMS Verification:</strong> We'll send you a 6-digit code to verify your phone number. 
                  Standard message rates may apply.
                </p>
              </div>

              {/* Hidden reCAPTCHA container */}
              <div id="recaptcha-container"></div>
            </div>
          )}

          {/* OTP Verification Screen */}
          {loginMethod === 'otp' && (
            <div className="space-y-4">
              <button
                onClick={goBack}
                className="flex items-center text-gray-600 hover:text-gray-800 text-sm mb-4"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to phone number
              </button>

              <div className="text-center mb-4">
                <div className="text-3xl mb-2">📱</div>
                <p className="text-gray-600">
                  Enter the 6-digit code sent to<br />
                  <strong>{phoneNumber}</strong>
                </p>
              </div>

              <div>
                <label htmlFor="otp" className="block text-sm font-medium text-gray-700 mb-2">
                  Verification Code
                </label>
                <input
                  type="text"
                  id="otp"
                  value={otpCode}
                  onChange={handleOTPChange}
                  placeholder="123456"
                  className="w-full px-4 py-3 text-center text-2xl font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent tracking-widest"
                  maxLength={6}
                  autoComplete="one-time-code"
                />
              </div>

              <button
                onClick={handleOTPVerification}
                disabled={loading || otpCode.length !== 6}
                className="w-full px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Verifying...
                  </div>
                ) : (
                  'Verify Code'
                )}
              </button>

              <div className="text-center">
                <button
                  onClick={handleResendOTP}
                  disabled={countdown > 0 || loading}
                  className="text-orange-600 hover:text-orange-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {countdown > 0 ? `Resend code in ${countdown}s` : 'Resend verification code'}
                </button>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
                <p className="text-sm text-green-800">
                  <strong>📨 Check your messages:</strong> The verification code should arrive within 30 seconds. 
                  If you don't receive it, check your spam folder or try resending.
                </p>
              </div>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="mt-4 text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg p-3">
              {success}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              {error}
              
              {/* Show Google sign-in fallback for rate limiting errors */}
              {(error.includes('Too many login attempts') || error.includes('Daily SMS limit') || error.includes('temporarily disabled')) && (
                <div className="mt-3 pt-3 border-t border-red-200">
                  <p className="text-red-700 font-medium mb-2">Try Google Sign-In Instead:</p>
                  <button
                    onClick={handleGoogleLogin}
                    disabled={loading}
                    className="w-full flex items-center justify-center px-4 py-2 bg-white border border-red-300 rounded-lg text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 transition-colors text-sm"
                  >
                    <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Sign in with Google
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoginModal; 