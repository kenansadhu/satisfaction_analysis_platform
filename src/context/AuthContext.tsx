"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type UserRole = "owner" | "admin" | "user";

export interface UserProfile {
    id: string;
    email: string | null;
    full_name: string | null;
    role: UserRole;
}

interface AuthContextValue {
    user: User | null;
    profile: UserProfile | null;
    role: UserRole | null;
    loading: boolean;        // false as soon as we know if user is logged in
    profileLoading: boolean; // false once profile row is fetched
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
    user: null,
    profile: null,
    role: null,
    loading: true,
    profileLoading: false,
    signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [profileLoading, setProfileLoading] = useState(false);

    async function loadProfile(userId: string) {
        setProfileLoading(true);
        const { data } = await supabase
            .from("profiles")
            .select("id, email, full_name, role")
            .eq("id", userId)
            .single();
        if (data) setProfile(data as UserProfile);
        setProfileLoading(false);
    }

    useEffect(() => {
        // onAuthStateChange fires immediately with INITIAL_SESSION in supabase-js v2.
        // No need for a separate getSession() call — that would double the profile fetch.
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, session) => {
                setUser(session?.user ?? null);
                setLoading(false); // unblock routing immediately — don't await profile
                if (session?.user) {
                    loadProfile(session.user.id);
                } else {
                    setProfile(null);
                }
            }
        );

        return () => subscription.unsubscribe();
    }, []);

    const signOut = async () => {
        await supabase.auth.signOut();
        setUser(null);
        setProfile(null);
    };

    return (
        <AuthContext.Provider value={{ user, profile, role: profile?.role ?? null, loading, profileLoading, signOut }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}

export function canAccessAdminPages(role: UserRole | null) {
    return role === "owner" || role === "admin";
}

export function isOwner(role: UserRole | null) {
    return role === "owner";
}
