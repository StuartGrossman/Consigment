import { useState, useEffect } from 'react';
import { User, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from '../config/firebase';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Store/update user data in Firestore
        await storeUserData(user);
      }
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const storeUserData = async (user: User) => {
    try {
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      
      const userData = {
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
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

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  return {
    user,
    loading,
    signInWithGoogle,
    logout,
    isAuthenticated: !!user
  };
}; 