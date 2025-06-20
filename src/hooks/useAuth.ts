import { useState, useEffect } from 'react';
import { User, signInWithPopup, signOut, onAuthStateChanged, signInAnonymously, updateProfile } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from '../config/firebase';
import { PhoneUser, AuthUser } from '../types';

export const useAuth = () => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        // Check for phone user session first
        const phoneUserSession = localStorage.getItem('phoneUserSession');
        const phoneUserData = localStorage.getItem('phoneUser');
        
        if (phoneUserSession === 'active' && phoneUserData) {
          // Load phone user from localStorage
          const phoneUser = JSON.parse(phoneUserData);
          console.log('Loading phone user from session:', phoneUser);
          setUser(phoneUser);
          setLoading(false);
          return;
        }
        
        if (firebaseUser) {
          // This is a Firebase Auth user (Google login)
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

  // Load admin state from localStorage
  useEffect(() => {
    if (user) {
      const adminState = localStorage.getItem(`adminMode_${user.uid}`);
      setIsAdmin(adminState === 'true');
    }
  }, [user]);

  const storeUserData = async (user: AuthUser) => {
    try {
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      
      const userData = {
        email: user.email || '',
        displayName: user.displayName,
        photoURL: user.photoURL || '',
        phoneNumber: 'phoneNumber' in user ? user.phoneNumber : '',
        isPhoneUser: 'isPhoneUser' in user ? user.isPhoneUser : false,
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
      const newAdminState = !isAdmin;
      setIsAdmin(newAdminState);
      localStorage.setItem(`adminMode_${user.uid}`, newAdminState.toString());
      
      console.log(`Toggling admin mode: ${isAdmin} → ${newAdminState}. Refreshing page...`);
      
      // Refresh the page to ensure all components re-initialize with new admin state
      setTimeout(() => {
        window.location.reload();
      }, 100);
    }
  };

  const signInWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      // User data will be stored automatically via onAuthStateChanged
      return result.user;
    } catch (error) {
      console.error('Error signing in with Google:', error);
      throw error;
    }
  };

  const signInWithPhone = async (phoneNumber: string) => {
    try {
      // Validate phone number format
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      if (cleanPhone.length !== 10) {
        throw new Error('Please enter a valid 10-digit phone number');
      }

      // Format phone number consistently
      const formattedPhone = `+1${cleanPhone}`;
      
      console.log('Attempting phone sign-in with:', formattedPhone);

      // Generate a unique UID for the phone user (local session)
      const phoneUID = `phone_${cleanPhone}_${Date.now()}`;

      // Create phone user object without Firebase Auth
      const phoneUser: PhoneUser = {
        uid: phoneUID,
        phoneNumber: formattedPhone,
        displayName: `📱 ${phoneNumber}`,
        email: undefined,
        photoURL: undefined,
        isPhoneUser: true
      };

      console.log('Created phone user object:', phoneUser);

      // Store phone user in localStorage for session persistence
      localStorage.setItem('phoneUser', JSON.stringify(phoneUser));
      localStorage.setItem('phoneUserSession', 'active');
      
      // Store user data in Firestore using the generated UID
      await storeUserData(phoneUser);
      
      // Set the user directly since we're not using Firebase Auth
      setUser(phoneUser);
      
      console.log('Phone authentication completed successfully');
      
      return phoneUser;
    } catch (error) {
      console.error('Error signing in with phone:', error);
      
      // Provide more specific error messages
      if (error instanceof Error) {
        if (error.message.includes('phone number')) {
          throw new Error('Please enter a valid phone number');
        } else if (error.message.includes('auth')) {
          throw new Error('Authentication service is currently unavailable. Please try again later.');
        } else {
          throw new Error(`Sign-in failed: ${error.message}`);
        }
      }
      
      throw new Error('Phone sign-in failed. Please try again.');
    }
  };

  const logout = async () => {
    try {
      // Check if this is a phone user
      const phoneUserSession = localStorage.getItem('phoneUserSession');
      
      if (phoneUserSession === 'active') {
        // Phone user logout - just clear localStorage
        localStorage.removeItem('phoneUser');
        localStorage.removeItem('phoneUserSession');
        console.log('Phone user logged out');
      } else {
        // Firebase user logout
        await signOut(auth);
      }
      
      // Clear admin state
      if (user) {
        localStorage.removeItem(`adminMode_${user.uid}`);
      }
      
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
    logout,
    isAuthenticated: !!user,
    isAdmin,
    toggleAdmin
  };
}; 