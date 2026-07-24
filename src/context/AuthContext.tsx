import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { User } from "firebase/auth";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { get, ref, set } from "firebase/database";
import { auth, db } from "../lib/firebase";

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: string;
  createdAt: number;
  [key: string]: any;
}

type ProfileIssue =
  | "missing_profile"
  | "missing_role"
  | "permission_denied"
  | "read_error"
  | null;

interface SessionRecord {
  uid: string;
  startMs: number;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  profileIssue: ProfileIssue;
  loading: boolean;

  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;

  register: (
    email: string,
    password: string,
    displayName: string,
    role: string
  ) => Promise<void>;

  refreshProfile: () => Promise<UserProfile | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const SESSION_STORAGE_KEY = "petty_management";

function readSessionRecord(): SessionRecord | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;

    const obj = JSON.parse(raw);

    if (
      obj &&
      typeof obj.uid === "string" &&
      typeof obj.startMs === "number"
    ) {
      return obj as SessionRecord;
    }
  } catch {}

  return null;
}

function writeSessionRecord(uid: string, startMs: number): void {
  localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({
      uid,
      startMs,
    })
  );
}

function clearSessionRecord(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileIssue, setProfileIssue] =
    useState<ProfileIssue>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(
    async (uid: string): Promise<UserProfile | null> => {
      setProfileIssue(null);

      try {
        const snap = await get(ref(db, `users/${uid}`));

        if (!snap.exists()) {
          setProfile(null);
          setProfileIssue("missing_profile");
          return null;
        }

        const data = snap.val();

        const merged: UserProfile = {
          uid,
          ...data,
        };

        setProfile(merged);

        if (!data?.role || String(data.role).trim() === "") {
          setProfileIssue("missing_role");
        }

        return merged;
      } catch (e: any) {
        console.error(e);

        setProfile(null);

        const denied =
          e?.code === "PERMISSION_DENIED" ||
          String(e?.message ?? "").includes("Permission denied");

        setProfileIssue(
          denied ? "permission_denied" : "read_error"
        );

        return null;
      }
    },
    []
  );

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        await loadProfile(firebaseUser.uid);
      } else {
        setProfile(null);
        setProfileIssue(null);
      }

      setLoading(false);
    });
  }, [loadProfile]);

  useEffect(() => {
    if (!user) return;

    const uid = user.uid;

    let record = readSessionRecord();

    if (!record || record.uid !== uid) {
      record = {
        uid,
        startMs: Date.now(),
      };

      writeSessionRecord(uid, record.startMs);
    }

    const signOutIfExpired = () => {
      const current = readSessionRecord();

      if (!current || current.uid !== uid) return;

      if (
        Date.now() - current.startMs >=
        SESSION_DURATION_MS
      ) {
        clearSessionRecord();
        signOut(auth);
      }
    };

    const elapsed = Date.now() - record.startMs;

    if (elapsed >= SESSION_DURATION_MS) {
      clearSessionRecord();
      signOut(auth);
      return;
    }

    const timeout = setTimeout(
      signOutIfExpired,
      SESSION_DURATION_MS - elapsed
    );

    const interval = setInterval(signOutIfExpired, 60000);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [user]);

  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      const trimmedEmail = email.trim();

      if (!trimmedEmail.includes("@")) {
        throw new Error("Enter a valid email address.");
      }

      await signInWithEmailAndPassword(
        auth,
        trimmedEmail,
        password
      );
    },
    []
  );

  const logout = useCallback(async (): Promise<void> => {
    clearSessionRecord();
    await signOut(auth);
  }, []);

  const register = useCallback(
    async (
      email: string,
      password: string,
      displayName: string,
      role: string
    ): Promise<void> => {
      const cred = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      await set(ref(db, `users/${cred.user.uid}`), {
        email,
        displayName:
          displayName || email.split("@")[0],
        role,
        createdAt: Date.now(),
      });

      await loadProfile(cred.user.uid);
    },
    [loadProfile]
  );

  const refreshProfile = useCallback(async () => {
    if (!user) return null;

    return loadProfile(user.uid);
  }, [user, loadProfile]);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      profile,
      profileIssue,
      loading,
      login,
      logout,
      register,
      refreshProfile,
    }),
    [
      user,
      profile,
      profileIssue,
      loading,
      login,
      logout,
      register,
      refreshProfile,
    ]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error(
      "useAuth must be used within AuthProvider"
    );
  }

  return ctx;
}