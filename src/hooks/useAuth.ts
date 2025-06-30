import { useState, useEffect } from 'react';
import { User, signInWithPopup, signOut, onAuthStateChanged, signInWithPhoneNumber, PhoneAuthProvider, signInWithCredential, RecaptchaVerifier } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from '../config/firebase';
import { AuthUser } from '../types';
import { logUserAction } from '../services/firebaseService';

export const useAuth = () => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [switchingAdminMode, setSwitchingAdminMode] = useState(false);

  // Phone verification states
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [recaptchaVerifier, setRecaptchaVerifier] = useState<RecaptchaVerifier | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          // This is a Firebase Auth user (Google login or Phone login)
          console.log('Loading Firebase user:', firebaseUser.uid);
          await storeUserData(firebaseUser);
          setUser(firebaseUser);
        } else {
          // No authenticated user
          setUser(null);
        }
      } catch (error) {
        console.error('Error in auth state change:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Load admin state - improved synchronization
  useEffect(() => {
    const loadAdminStatus = async () => {
      if (user) {
        try {
          // Check localStorage first for immediate response
          const localAdminState = localStorage.getItem(`adminMode_${user.uid}`) === 'true';
          setIsAdmin(localAdminState);
          
          // If user is admin, try to sync with Firestore (but don't fail if it doesn't work)
          if (localAdminState) {
            try {
              const userRef = doc(db, 'users', user.uid);
              const userDoc = await getDoc(userRef);
              
              if (!userDoc.exists()) {
                // Try to create the user document, but don't fail the whole process if it doesn't work
                await setDoc(userRef, {
                  isAdmin: true,
                  email: user.email || '',
                  displayName: user.displayName || '',
                  photoURL: user.photoURL || '',
                  phoneNumber: user.phoneNumber || '',
                  lastSignIn: new Date(),
                  createdAt: new Date(),
                }, { merge: true });
                console.log('✅ Created admin user document in Firestore');
              } else if (!userDoc.data()?.isAdmin) {
                // Update existing document to add admin status
                await setDoc(userRef, {
                  isAdmin: true,
                  lastSignIn: new Date(),
                }, { merge: true });
                console.log('✅ Updated admin status in Firestore');
              }
            } catch (error: any) {
              // Silent fallback for permission errors - don't log to console for permission issues
              if (error?.code === 'permission-denied' || error?.message?.includes('Missing or insufficient permissions')) {
                // For permission errors, just use the local state and don't log error
                console.log('📍 Using local admin state due to permissions');
                return;
              }
              console.error('❌ Error loading admin status:', error);
            }
          }
          
          console.log(`📋 Admin status loaded: ${localAdminState}`);
        } catch (error) {
          console.error('❌ Error loading admin status:', error);
          // Fall back to localStorage value even if Firestore fails
          const localAdminState = localStorage.getItem(`adminMode_${user.uid}`) === 'true';
          setIsAdmin(localAdminState);
          console.log(`📋 Using local admin status: ${localAdminState}`);
        }
      } else {
        setIsAdmin(false);
      }
    };

    loadAdminStatus();
  }, [user]);

  const storeUserData = async (user: AuthUser) => {
    try {
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      
      const userData = {
        email: user.email || '',
        displayName: user.displayName || (user.phoneNumber ? `📱 ${user.phoneNumber}` : 'Phone User'),
        photoURL: user.photoURL || '',
        phoneNumber: user.phoneNumber || '',
        lastSignIn: new Date(),
      };

      if (!userDoc.exists()) {
        // New user - create document
        await setDoc(userRef, {
          ...userData,
          createdAt: new Date(),
        });
      } else {
        // Existing user - update last sign in
        await setDoc(userRef, userData, { merge: true });
      }
    } catch (error) {
      console.error('Error storing user data:', error);
    }
  };

  const toggleAdmin = () => {
    if (user) {
      // Set loading state immediately for instant UI feedback
      setSwitchingAdminMode(true);
      
      const newAdminState = !isAdmin;
      
      // Store admin state in localStorage immediately
      localStorage.setItem(`adminMode_${user.uid}`, newAdminState.toString());
      
      console.log(`🔄 Admin mode ${newAdminState ? 'enabled' : 'disabled'} for user ${user.uid}`);
      
      // Update state and refresh page for clean data reload
      setTimeout(() => {
        setIsAdmin(newAdminState);
        window.location.reload();
      }, 50); // Minimal delay to ensure localStorage is saved
    }
  };

  const signInWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      // Log the login action
      await logUserAction(result.user, 'user_login', 'User logged in with Google');
      // User data will be stored automatically via onAuthStateChanged
      return result.user;
    } catch (error) {
      console.error('Error signing in with Google:', error);
      throw error;
    }
  };

  const setupRecaptcha = (containerId: string): RecaptchaVerifier => {
    const verifier = new RecaptchaVerifier(auth, containerId, {
      size: 'invisible',
      callback: (response: any) => {
        console.log('✅ reCAPTCHA solved:', response);
      },
      'expired-callback': () => {
        console.log('⚠️ reCAPTCHA expired');
      },
      'error-callback': (error: any) => {
        console.log('❌ reCAPTCHA error:', error);
      }
    });
    
    setRecaptchaVerifier(verifier);
    console.log('🔧 reCAPTCHA verifier created for container:', containerId);
    return verifier;
  };

  const signInWithPhone = async (phoneNumber: string, recaptchaContainer?: string): Promise<string> => {
    try {
      // Validate phone number format
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      if (cleanPhone.length !== 10) {
        throw new Error('Please enter a valid 10-digit phone number');
      }

      // Format phone number for Firebase (E.164 format)
      const formattedPhone = `+1${cleanPhone}`;
      
      console.log('🚀 Starting Firebase Phone Auth with:', formattedPhone);
      console.log('🔧 Auth instance:', auth);
      console.log('🔧 App config:', auth.app.options);

      // Setup reCAPTCHA verifier
      let verifier = recaptchaVerifier;
      if (!verifier) {
        const containerId = recaptchaContainer || 'recaptcha-container';
        console.log('🔧 Setting up reCAPTCHA for container:', containerId);
        verifier = setupRecaptcha(containerId);
      }

      console.log('📱 Attempting to send SMS verification...');
      
      // Send SMS verification code
      const confirmationResult = await signInWithPhoneNumber(auth, formattedPhone, verifier);
      
      console.log('✅ SMS sent successfully');
      console.log('🔑 Verification ID:', confirmationResult.verificationId);
      setVerificationId(confirmationResult.verificationId);
      
      // Return the verification ID for the next step
      return confirmationResult.verificationId;
    } catch (error: any) {
      console.error('❌ Error in phone sign-in:', error);
      console.error('❌ Error code:', error.code);
      console.error('❌ Error message:', error.message);
      console.error('❌ Full error object:', error);
      
      // Clean up reCAPTCHA on error
      if (recaptchaVerifier) {
        recaptchaVerifier.clear();
        setRecaptchaVerifier(null);
      }
      
      // Provide user-friendly error messages
      if (error.code === 'auth/invalid-phone-number') {
        throw new Error('Please enter a valid phone number');
      } else if (error.code === 'auth/too-many-requests') {
        throw new Error('Too many requests. Please try again later.');
      } else if (error.code === 'auth/captcha-check-failed') {
        throw new Error('reCAPTCHA verification failed. Please try again.');
      } else if (error.code === 'auth/invalid-app-credential') {
        console.error('🚨 FIREBASE CONFIG ISSUE: Phone authentication may not be enabled in Firebase Console');
        console.error('🔗 Check: https://console.firebase.google.com/project/consignment-store-4a564/authentication/providers');
        throw new Error('Phone authentication not properly configured. Please check Firebase Console.');
      } else {
        throw new Error(`Phone sign-in failed: ${error.message}`);
      }
    }
  };

  const verifyOTP = async (verificationCode: string): Promise<User> => {
    try {
      if (!verificationId) {
        throw new Error('No verification ID found. Please restart the phone sign-in process.');
      }

      console.log('Verifying OTP code:', verificationCode);

      // Create phone auth credential
      const credential = PhoneAuthProvider.credential(verificationId, verificationCode);
      
      // Sign in with the credential
      const result = await signInWithCredential(auth, credential);
      
      console.log('Phone verification successful:', result.user.uid);
      
      // Log the login action
      await logUserAction(result.user, 'user_login', 'User logged in with phone number');
      
      // Clean up
      setVerificationId(null);
      if (recaptchaVerifier) {
        recaptchaVerifier.clear();
        setRecaptchaVerifier(null);
      }
      
      return result.user;
    } catch (error: any) {
      console.error('Error verifying OTP:', error);
      
      // Provide user-friendly error messages
      if (error.code === 'auth/invalid-verification-code') {
        throw new Error('Invalid verification code. Please check and try again.');
      } else if (error.code === 'auth/code-expired') {
        throw new Error('Verification code has expired. Please request a new one.');
      } else {
        throw new Error(`Verification failed: ${error.message}`);
      }
    }
  };

  const resendOTP = async (): Promise<string> => {
    try {
      if (!recaptchaVerifier) {
        throw new Error('Please restart the phone sign-in process.');
      }

      // Get the last phone number used (you might want to store this)
      const lastPhoneNumber = localStorage.getItem('lastPhoneNumber');
      if (!lastPhoneNumber) {
        throw new Error('No phone number found. Please restart the sign-in process.');
      }

      console.log('Resending OTP to:', lastPhoneNumber);

      const confirmationResult = await signInWithPhoneNumber(auth, lastPhoneNumber, recaptchaVerifier);
      setVerificationId(confirmationResult.verificationId);
      
      return confirmationResult.verificationId;
    } catch (error: any) {
      console.error('Error resending OTP:', error);
      throw new Error(`Failed to resend OTP: ${error.message}`);
    }
  };

  const logout = async () => {
    try {
      // Log the logout action before clearing user state
      if (user) {
        await logUserAction(user, 'user_logout', 'User logged out');
      }
      
      // Firebase user logout
      await signOut(auth);
      
      // Clear admin state
      if (user) {
        localStorage.removeItem(`adminMode_${user.uid}`);
      }
      
      // Clear phone auth state
      setVerificationId(null);
      if (recaptchaVerifier) {
        recaptchaVerifier.clear();
        setRecaptchaVerifier(null);
      }
      
      // Clear stored phone number
      localStorage.removeItem('lastPhoneNumber');
      
      setUser(null);
      setIsAdmin(false);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  return {
    user,
    loading,
    signInWithGoogle,
    signInWithPhone,
    verifyOTP,
    resendOTP,
    logout,
    isAuthenticated: !!user,
    isAdmin,
    toggleAdmin,
    switchingAdminMode,
    verificationId,
    setupRecaptcha
  };
}; 