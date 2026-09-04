import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth } from '../services/firebase';

interface AuthState {
  user: FirebaseUser | null;
  isLoading: boolean;
  error: string | null;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const googleProvider = new GoogleAuthProvider();

export const useAuthStore = create<AuthState>()(
  subscribeWithSelector((set) => ({
    user: null,
    isLoading: true,
    error: null,

    signUpWithEmail: async (email, password) => {
      set({ error: null });
      try {
        await createUserWithEmailAndPassword(auth, email, password);
      } catch (err) {
        const message = getAuthErrorMessage(err);
        set({ error: message });
        throw new Error(message);
      }
    },

    signInWithEmail: async (email, password) => {
      set({ error: null });
      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (err) {
        const message = getAuthErrorMessage(err);
        set({ error: message });
        throw new Error(message);
      }
    },

    signInWithGoogle: async () => {
      set({ error: null });
      try {
        await signInWithPopup(auth, googleProvider);
      } catch (err) {
        const message = getAuthErrorMessage(err);
        set({ error: message });
        throw new Error(message);
      }
    },

    logout: async () => {
      set({ error: null });
      try {
        await signOut(auth);
      } catch (err) {
        const message = getAuthErrorMessage(err);
        set({ error: message });
        throw new Error(message);
      }
    },

    clearError: () => set({ error: null }),
  }))
);

onAuthStateChanged(auth, (user) => {
  useAuthStore.setState({ user, isLoading: false });
});

function getAuthErrorMessage(err: unknown): string {
  if (err instanceof Error && 'code' in err) {
    const code = (err as { code: string }).code;
    switch (code) {
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Invalid email or password.';
      case 'auth/email-already-in-use':
        return 'An account with this email already exists.';
      case 'auth/weak-password':
        return 'Password should be at least 6 characters.';
      case 'auth/popup-closed-by-user':
        return 'Google sign-in was cancelled.';
      case 'auth/popup-blocked':
        return 'Popup was blocked. Please allow popups and try again.';
      case 'auth/unauthorized-domain':
        return 'This domain is not authorized for Google sign-in.';
      default:
        return err.message || 'Authentication failed. Please try again.';
    }
  }
  return 'Authentication failed. Please try again.';
}
