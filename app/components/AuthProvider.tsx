"use client";

import { createContext, useContext, useMemo } from "react";
import { ClerkProvider, UserButton, useClerk, useUser } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { useTheme } from "next-themes";
import { LogIn } from "lucide-react";

/**
 * Optional Clerk auth, wrapped so the rest of the app never imports Clerk
 * hooks directly. With no publishable key the provider renders nothing extra
 * and `useAuth()` reports auth as disabled, so the account-less BYOK flow
 * keeps working exactly as before. With a key, sign-in becomes the friction
 * gate for the free credits (image models cost real money) and the server
 * writes each user's remaining count into their Clerk metadata.
 */

// Module constant: NEXT_PUBLIC_ vars are inlined at build time, so this can
// never change between renders (safe to branch around hooks).
const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export type AuthState = {
  /** Whether Clerk is configured at all (false = account-less mode). */
  enabled: boolean;
  /** False while Clerk is still resolving the session on load. */
  isLoaded: boolean;
  isSignedIn: boolean;
  /**
   * Server-tracked free credits left (the generate API writes it to the user
   * after each run), or null when unknown (fresh account: nothing spent yet).
   */
  remaining: number | null;
  /** Open Clerk's sign-in modal. */
  openSignIn: () => void;
  /** Re-pull the user record to pick up a fresh `remaining` count. */
  refresh: () => Promise<void>;
};

const DISABLED_AUTH: AuthState = {
  enabled: false,
  isLoaded: true,
  isSignedIn: false,
  remaining: null,
  openSignIn: () => {},
  refresh: async () => {},
};

const AuthContext = createContext<AuthState>(DISABLED_AUTH);

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

/** Reads Clerk state and republishes it as the app-level AuthState. */
function ClerkAuthBridge({ children }: { children: React.ReactNode }) {
  const { user, isLoaded, isSignedIn } = useUser();
  const clerk = useClerk();
  const raw = user?.unsafeMetadata?.remaining;
  const remaining = typeof raw === "number" ? Math.max(0, raw) : null;
  const value = useMemo<AuthState>(
    () => ({
      enabled: true,
      isLoaded,
      isSignedIn: !!isSignedIn,
      remaining,
      openSignIn: () => clerk.openSignIn({}),
      refresh: async () => {
        try {
          await user?.reload();
        } catch {
          /* transient; the next generation refreshes it anyway */
        }
      },
    }),
    [isLoaded, isSignedIn, remaining, user, clerk],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { resolvedTheme } = useTheme();
  if (!CLERK_ENABLED) return <>{children}</>;
  return (
    <ClerkProvider
      appearance={{
        // Clerk's modals follow the app theme instead of defaulting to light.
        theme: resolvedTheme === "dark" ? dark : undefined,
        variables: {
          colorPrimary: "hsl(231 45% 51%)",
          borderRadius: "0.75rem",
        },
      }}
    >
      <ClerkAuthBridge>{children}</ClerkAuthBridge>
    </ClerkProvider>
  );
}

/**
 * Header auth widget: a quiet "Sign in" pill when signed out, Clerk's avatar
 * menu (profile / sign out) when signed in. Renders nothing in account-less
 * mode, so the header is unchanged without Clerk keys.
 */
export function AuthControls() {
  const auth = useAuth();
  if (!auth.enabled) return null;
  if (!auth.isLoaded) {
    // Placeholder keeps the header from shifting when the button pops in.
    return <span aria-hidden className="size-10 sm:size-9" />;
  }
  if (!auth.isSignedIn) {
    return (
      <button
        type="button"
        onClick={auth.openSignIn}
        className="flex h-10 items-center gap-1.5 rounded-full border border-border/70 px-3.5 text-[0.8125rem] font-semibold text-foreground transition-colors hover:border-border hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:h-9"
      >
        <LogIn className="size-3.5" />
        Sign in
      </button>
    );
  }
  return (
    <span className="flex size-10 items-center justify-center sm:size-9">
      <UserButton
        appearance={{
          elements: { avatarBox: "size-9 sm:size-8" },
        }}
      />
    </span>
  );
}
