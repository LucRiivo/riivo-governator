import { useAction, useQuery } from "convex/react";
import React, { useState } from 'react';
import { api } from "@/convex/_generated/api";
import {
    Building2,
    Shield,
    Users,
    RefreshCw,
    ChevronRight,
    ChevronDown,
    Ban,
    Crown,
    KeyRound,
    UserCheck,
} from 'lucide-react';

interface SecurityListProps {
    selectedTab: string;
    selectedItem: any;
    setSelectedItem: (item: any) => void;
    activeTenantId?: string;
    orgId?: string;
    searchQuery?: string;
}

function TeamTypeBadge({ teamType }: { teamType: number }) {
    const config: Record<number, { label: string; className: string }> = {
        0: { label: "Owner", className: "bg-indigo-50 text-indigo-600 border-indigo-100" },
        2: { label: "AAD Security", className: "bg-emerald-50 text-emerald-600 border-emerald-100" },
        3: { label: "AAD Office", className: "bg-sky-50 text-sky-600 border-sky-100" },
    };
    const { label, className } = config[teamType] || { label: `Type ${teamType}`, className: "bg-slate-50 text-slate-600 border-slate-100" };
    return (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${className}`}>
            {label}
        </span>
    );
}

interface BUTreeNodeProps {
    bu: any;
    allBUs: any[];
    level: number;
    selectedItem: any;
    setSelectedItem: (item: any) => void;
    searchQuery: string;
}

function BUTreeNode({ bu, allBUs, level, selectedItem, setSelectedItem, searchQuery }: BUTreeNodeProps) {
    const [expanded, setExpanded] = useState(level < 2);
    const children = allBUs.filter((child: any) => child.parentBusinessUnitId === bu.businessUnitId);
    const hasChildren = children.length > 0;
    const isSelected = selectedItem?.businessUnitId === bu.businessUnitId;

    const matchesSearch = !searchQuery || bu.name.toLowerCase().includes(searchQuery.toLowerCase());

    const childrenMatchSearch = searchQuery
        ? allBUs.some((child: any) => {
            const isDescendant = (parentId: string): boolean => {
                if (child.parentBusinessUnitId === parentId) return true;
                const parent = allBUs.find((b: any) => b.businessUnitId === child.parentBusinessUnitId);
                return parent ? isDescendant(parent.businessUnitId) : false;
            };
            return child.name.toLowerCase().includes(searchQuery.toLowerCase()) && isDescendant(bu.businessUnitId);
        })
        : false;

    if (searchQuery && !matchesSearch && !childrenMatchSearch) return null;

    return (
        <div>
            <div
                onClick={() => setSelectedItem(bu)}
                className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-all border-l-4 ${isSelected ? 'bg-indigo-50/50 border-indigo-500' : 'hover:bg-slate-50 border-transparent'
                    }`}
                style={{ paddingLeft: `${12 + level * 16}px` }}
            >
                {hasChildren ? (
                    <button
                        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                        className="p-0.5 hover:bg-slate-200 rounded transition-colors"
                    >
                        {expanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                    </button>
                ) : (
                    <span className="w-5" />
                )}
                <Building2 size={14} className={isSelected ? "text-indigo-500" : "text-slate-400"} />
                <span className={`text-sm font-medium flex-1 ${bu.isDisabled ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                    {bu.name}
                </span>
                {bu.isDisabled && (
                    <span title="Disabled"><Ban size={12} className="text-rose-400" /></span>
                )}
                {!bu.parentBusinessUnitId && (
                    <span title="Root BU"><Crown size={12} className="text-amber-400" /></span>
                )}
            </div>
            {expanded && hasChildren && (
                <div>
                    {children.map((child: any) => (
                        <BUTreeNode
                            key={child.businessUnitId || child._id}
                            bu={child}
                            allBUs={allBUs}
                            level={level + 1}
                            selectedItem={selectedItem}
                            setSelectedItem={setSelectedItem}
                            searchQuery={searchQuery}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function SecurityList({
    selectedTab,
    selectedItem,
    setSelectedItem,
    activeTenantId,
    orgId,
    searchQuery = ''
}: SecurityListProps) {
    const syncAllSecurity = useAction(api.actions.security.syncAllSecurity);
    const listBusinessUnits = useAction(api.actions.security.listBusinessUnits);
    const listSecurityRoles = useAction(api.actions.security.listSecurityRoles);
    const listSecurityTeams = useAction(api.actions.security.listSecurityTeams);

    const cachedBUs = useQuery(api.queries.getBusinessUnits, activeTenantId ? { tenantId: activeTenantId } : "skip");
    const cachedRoles = useQuery(api.queries.getSecurityRoles, activeTenantId ? { tenantId: activeTenantId } : "skip");
    const cachedTeams = useQuery(api.queries.getSecurityTeams, activeTenantId ? { tenantId: activeTenantId } : "skip");

    const [isSyncing, setIsSyncing] = useState(false);

    const handleSync = async () => {
        if (!activeTenantId) return;
        setIsSyncing(true);
        try {
            if (selectedTab === 'security-bu') {
                await listBusinessUnits({ tenantId: activeTenantId, orgId });
            } else if (selectedTab === 'security-roles') {
                await listSecurityRoles({ tenantId: activeTenantId, orgId });
            } else if (selectedTab === 'security-teams') {
                await listSecurityTeams({ tenantId: activeTenantId, orgId });
            }
        } catch (error) {
            console.error("Security sync failed:", error);
        } finally {
            setIsSyncing(false);
        }
    };

    const handleSyncAll = async () => {
        if (!activeTenantId) return;
        setIsSyncing(true);
        try {
            await syncAllSecurity({ tenantId: activeTenantId, orgId });
        } catch (error) {
            console.error("Full security sync failed:", error);
        } finally {
            setIsSyncing(false);
        }
    };

    const getTitle = () => {
        switch (selectedTab) {
            case 'security-bu': return 'Business Units';
            case 'security-roles': return 'Security Roles';
            case 'security-teams': return 'Teams';
            default: return 'Security';
        }
    };

    const getData = () => {
        switch (selectedTab) {
            case 'security-bu': return cachedBUs;
            case 'security-roles': return cachedRoles;
            case 'security-teams': return cachedTeams;
            default: return null;
        }
    };

    const data = getData();
    const lastSynced = data && data.length > 0
        ? Math.max(...data.map((d: any) => d.lastSynced || 0))
        : null;

    const formatTimeAgo = (timestamp: number) => {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return 'just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        return `${hours}h ago`;
    };

    // Filter helpers
    const filteredRoles = cachedRoles?.filter((role: any) =>
        role.name.toLowerCase().includes(searchQuery.toLowerCase())
    ) || [];

    const filteredTeams = cachedTeams?.filter((team: any) =>
        team.name.toLowerCase().includes(searchQuery.toLowerCase())
    ) || [];

    // For BU tree: find root nodes (no parent or parent not in list)
    const rootBUs = cachedBUs?.filter((bu: any) =>
        !bu.parentBusinessUnitId || !cachedBUs.some((other: any) => other.businessUnitId === bu.parentBusinessUnitId)
    ) || [];

    const renderEmptyState = (label: string) => (
        <div className="p-8 text-center">
            <p className="text-xs text-slate-400 mb-3">No {label} found.</p>
            <button
                onClick={handleSync}
                className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded border border-indigo-100 hover:bg-indigo-100 transition-colors font-medium"
            >
                Sync Now
            </button>
        </div>
    );

    return (
        <div className="w-80 border-r border-slate-200 overflow-y-auto bg-white shadow-sm z-0">
            <div className="p-4 border-b border-slate-100 sticky top-0 bg-white/90 backdrop-blur-md z-10">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="font-bold text-slate-800 text-xs tracking-wider uppercase mb-0.5">
                            {getTitle()}
                        </h2>
                        {lastSynced && (
                            <p className="text-[10px] text-slate-400 font-medium">
                                Synced {formatTimeAgo(lastSynced)}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={handleSyncAll}
                            disabled={isSyncing}
                            className="text-[10px] text-indigo-600 hover:text-indigo-700 transition-colors px-2 py-1 rounded-md hover:bg-indigo-50 font-medium disabled:opacity-50"
                            title="Sync all security data"
                        >
                            Sync All
                        </button>
                        <button
                            onClick={handleSync}
                            disabled={isSyncing}
                            className={`text-slate-400 hover:text-indigo-600 transition-colors p-1 rounded-md hover:bg-slate-100 ${isSyncing ? 'animate-spin text-indigo-600' : ''}`}
                            title={`Sync ${getTitle()} from Dynamics`}
                        >
                            <RefreshCw size={14} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="divide-y divide-slate-50">
                {/* Business Units - Tree View */}
                {selectedTab === 'security-bu' && (
                    <>
                        {!cachedBUs ? (
                            <div className="p-4 text-xs text-slate-400 text-center">Loading cache...</div>
                        ) : cachedBUs.length === 0 ? (
                            renderEmptyState("business units")
                        ) : (
                            rootBUs.map((bu: any) => (
                                <BUTreeNode
                                    key={bu.businessUnitId || bu._id}
                                    bu={bu}
                                    allBUs={cachedBUs}
                                    level={0}
                                    selectedItem={selectedItem}
                                    setSelectedItem={setSelectedItem}
                                    searchQuery={searchQuery}
                                />
                            ))
                        )}
                    </>
                )}

                {/* Security Roles */}
                {selectedTab === 'security-roles' && (
                    <>
                        {!cachedRoles ? (
                            <div className="p-4 text-xs text-slate-400 text-center">Loading cache...</div>
                        ) : cachedRoles.length === 0 ? (
                            renderEmptyState("security roles")
                        ) : filteredRoles.length === 0 ? (
                            <div className="p-8 text-center">
                                <p className="text-xs text-slate-400">No roles match &quot;{searchQuery}&quot;</p>
                            </div>
                        ) : (
                            filteredRoles.map((role: any) => (
                                <div
                                    key={role._id}
                                    onClick={() => setSelectedItem(role)}
                                    className={`p-4 cursor-pointer transition-all border-l-4 ${selectedItem?._id === role._id ? 'bg-indigo-50/50 border-indigo-500' : 'hover:bg-slate-50 border-transparent'
                                        }`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="flex items-center gap-2">
                                            <Shield size={14} className={selectedItem?._id === role._id ? "text-indigo-500" : "text-slate-400"} />
                                            <span className="font-semibold text-slate-900 text-sm">{role.name}</span>
                                        </div>
                                        <div className="flex gap-1">
                                            {role.isManaged && (
                                                <span className="text-[10px] font-bold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-100">
                                                    Managed
                                                </span>
                                            )}
                                            {!role.isManaged && (
                                                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">
                                                    Custom
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-3 text-[11px] text-slate-500 font-medium ml-6">
                                        <span className="flex items-center gap-1 opacity-70">
                                            <KeyRound size={11} />
                                            {role.isCustomizable !== false ? 'Customizable' : 'Locked'}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </>
                )}

                {/* Security Teams */}
                {selectedTab === 'security-teams' && (
                    <>
                        {!cachedTeams ? (
                            <div className="p-4 text-xs text-slate-400 text-center">Loading cache...</div>
                        ) : cachedTeams.length === 0 ? (
                            renderEmptyState("teams")
                        ) : filteredTeams.length === 0 ? (
                            <div className="p-8 text-center">
                                <p className="text-xs text-slate-400">No teams match &quot;{searchQuery}&quot;</p>
                            </div>
                        ) : (
                            filteredTeams.map((team: any) => (
                                <div
                                    key={team._id}
                                    onClick={() => setSelectedItem(team)}
                                    className={`p-4 cursor-pointer transition-all border-l-4 ${selectedItem?._id === team._id ? 'bg-indigo-50/50 border-indigo-500' : 'hover:bg-slate-50 border-transparent'
                                        }`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="flex items-center gap-2">
                                            <Users size={14} className={selectedItem?._id === team._id ? "text-indigo-500" : "text-slate-400"} />
                                            <span className="font-semibold text-slate-900 text-sm">{team.name}</span>
                                        </div>
                                        <TeamTypeBadge teamType={team.teamType} />
                                    </div>
                                    <div className="flex gap-3 text-[11px] text-slate-500 font-medium ml-6">
                                        <span className="flex items-center gap-1 opacity-70">
                                            <UserCheck size={11} />
                                            {team.roles.length} role{team.roles.length !== 1 ? 's' : ''}
                                        </span>
                                        {team.isDefault && (
                                            <span className="text-[10px] text-slate-400">Default</span>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
