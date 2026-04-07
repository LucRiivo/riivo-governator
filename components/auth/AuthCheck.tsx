"use strict";
"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useUser, UserButton, OrganizationSwitcher } from "@clerk/nextjs";
import { ReactNode, useEffect } from "react";

export default function AuthCheck({ children }: { children: ReactNode }) {
    const { user, isLoaded: isUserLoaded } = useUser();
    // @ts-expect-error Convex type depth limit with expanded schema
    const userData = useQuery(api.users.syncUser);
    const storeUser = useMutation(api.users.store);

    useEffect(() => {
        if (isUserLoaded && user && userData === null) {
            storeUser({});
        }
    }, [isUserLoaded, user, userData, storeUser]);

    if (!isUserLoaded) return null; // Or a loading spinner

    if (!user) {
        // Should be handled by middleware, but double check
        return (
            <div className="flex flex-col items-center justify-center h-screen gap-4">
                <h1 className="text-2xl font-bold">Welcome to Governator</h1>
                <p>Please sign in to continue</p>
                <div className="p-4 bg-white rounded shadow">
                    <UserButton /> {/* Fallback if no redirect happened */}
                </div>
            </div>
        );
    }

    // Check allowlist
    // If userData is undefined, still loading.
    if (userData === undefined) {
        return (
            <div className="flex flex-col items-center justify-center h-screen gap-4">
                <p>Loading user data...</p>
            </div>
        );
    }

    // If userData is null, it means we are syncing (useEffect above should have triggered store)
    if (userData === null) {
        return (
            <div className="flex flex-col items-center justify-center h-screen gap-4">
                <p>Syncing your account...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen">
            <header className="flex items-center justify-between p-4 border-b bg-white shadow-sm z-10">
                <div className="flex items-center gap-4">
                    <h1 className="text-xl font-bold">Governator</h1>
                    <OrganizationSwitcher />
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-500">{userData ? userData.name : ''}</span>
                    <UserButton />
                </div>
            </header>
            <main className="flex-1 overflow-auto bg-gray-50">
                {children}
            </main>
        </div>
    );
}
