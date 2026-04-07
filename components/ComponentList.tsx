import { useAction, useQuery } from "convex/react";
import React, { useEffect, useState } from 'react';
import { api } from "@/convex/_generated/api";
import { Terminal, Link as LinkIcon, RefreshCw, Layout, Code, CheckCircle, FileText } from 'lucide-react';
import StatusBadge from './StatusBadge';

interface ComponentListProps {
    selectedTab: string;
    selectedItem: any;
    setSelectedItem: (item: any) => void;
    activeTenantId?: string;
    orgId?: string; // Clerk Organization ID
    searchQuery?: string; // Search filter
    onBulkDocs?: () => void; // Open bulk documentation panel
}

export default function ComponentList({ selectedTab, selectedItem, setSelectedItem, activeTenantId, orgId, searchQuery = '', onBulkDocs }: ComponentListProps) {
    const listFlows = useAction(api.actions.listFlows);
    const listTables = useAction(api.actions.listTables);

    // Read from cache (Instant Load)
    const cachedFlows = useQuery(api.queries.getFlows, activeTenantId ? { tenantId: activeTenantId } : "skip");
    const cachedTables = useQuery(api.queries.getTables, activeTenantId ? { tenantId: activeTenantId } : "skip");

    const [isSyncing, setIsSyncing] = useState(false);

    // Calculate last synced time for flows
    const lastSyncedFlows = cachedFlows && cachedFlows.length > 0
        ? Math.max(...cachedFlows.map((f: any) => f.lastSynced || 0))
        : null;

    // Calculate last synced time for tables
    const lastSyncedTables = cachedTables && cachedTables.length > 0
        ? Math.max(...cachedTables.map((t: any) => t.lastSynced || 0))
        : null;

    // Filter flows by search query
    const filteredFlows = cachedFlows?.filter((flow: any) =>
        flow.name.toLowerCase().includes(searchQuery.toLowerCase())
    ) || [];

    // Filter tables by search query
    const filteredTables = cachedTables?.filter((table: any) =>
        table.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        table.logicalName.toLowerCase().includes(searchQuery.toLowerCase())
    ) || [];

    const handleSync = async () => {
        if (!activeTenantId) return;
        setIsSyncing(true);
        try {
            if (selectedTab === 'flows') {
                await listFlows({ tenantId: activeTenantId, orgId });
            } else if (selectedTab === 'tables') {
                await listTables({ tenantId: activeTenantId, orgId });
            }
        } catch (error) {
            console.error("Sync failed:", error);
        } finally {
            setIsSyncing(false);
        }
    };

    const formatTimeAgo = (timestamp: number) => {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return 'just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        return `${hours}h ago`;
    };

    const lastSynced = selectedTab === 'flows' ? lastSyncedFlows : lastSyncedTables;

    return (
        <div className="w-80 border-r border-slate-200 overflow-y-auto bg-white shadow-sm z-0">
            <div className="p-4 border-b border-slate-100 sticky top-0 bg-white/90 backdrop-blur-md z-10 flex items-center justify-between">
                <div>
                    <h2 className="font-bold text-slate-800 text-xs tracking-wider uppercase mb-0.5">
                        {selectedTab === 'flows' ? 'Solution Flows' : 'Dataverse Tables'}
                    </h2>
                    {lastSynced && (
                        <p className="text-[10px] text-slate-400 font-medium">
                            Synced {formatTimeAgo(lastSynced)}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    {selectedTab === 'flows' && onBulkDocs && (
                        <button
                            onClick={onBulkDocs}
                            className="text-slate-400 hover:text-violet-600 transition-colors p-1 rounded-md hover:bg-slate-100"
                            title="Bulk Generate & Publish Documentation"
                        >
                            <FileText size={14} />
                        </button>
                    )}
                    <button
                        onClick={handleSync}
                        disabled={isSyncing}
                        className={`text-slate-400 hover:text-indigo-600 transition-colors p-1 rounded-md hover:bg-slate-100 ${isSyncing ? 'animate-spin text-indigo-600' : ''}`}
                        title={selectedTab === 'flows' ? "Sync Flows from Dynamics" : "Sync Tables from Dynamics"}
                    >
                        <RefreshCw size={14} />
                    </button>
                </div>
            </div>
            <div className="divide-y divide-slate-50">
                {selectedTab === 'flows' && (
                    <>
                        {!cachedFlows ? (
                            <div className="p-4 text-xs text-slate-400 text-center">Loading cache...</div>
                        ) : cachedFlows.length === 0 ? (
                            <div className="p-8 text-center">
                                <p className="text-xs text-slate-400 mb-3">No flows found.</p>
                                <button
                                    onClick={handleSync}
                                    className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded border border-indigo-100 hover:bg-indigo-100 transition-colors font-medium"
                                >
                                    Sync Now
                                </button>
                            </div>
                        ) : filteredFlows.length === 0 ? (
                            <div className="p-8 text-center">
                                <p className="text-xs text-slate-400">No flows match "{searchQuery}"</p>
                            </div>
                        ) : (
                            filteredFlows.map((flow: any) => (
                                <div
                                    key={flow._id}
                                    onClick={() => setSelectedItem(flow)}
                                    className={`p-4 cursor-pointer transition-all border-l-4 ${selectedItem?._id === flow._id ? 'bg-indigo-50/50 border-indigo-500' : 'hover:bg-slate-50 border-transparent'}`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="font-semibold text-slate-900 text-sm">{flow.name}</span>
                                        <div className="flex flex-col items-end gap-1">
                                            <StatusBadge status={flow.status} />
                                            {flow.lastAudited && (
                                                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 flex items-center gap-1">
                                                    <CheckCircle size={10} /> Audited
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-3 text-[11px] text-slate-500 font-medium">
                                        <span className="flex items-center gap-1 opacity-70"><Terminal size={12} /> {flow.logic.steps} steps</span>
                                        <span className="flex items-center gap-1 opacity-70"><LinkIcon size={12} /> {flow.connRefs} refs</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </>
                )}
                {selectedTab === 'tables' && (
                    <>
                        {!cachedTables ? (
                            <div className="p-4 text-xs text-slate-400 text-center">Loading cache...</div>
                        ) : cachedTables.length === 0 ? (
                            <div className="p-8 text-center">
                                <p className="text-xs text-slate-400 mb-3">No tables found.</p>
                                <button
                                    onClick={handleSync}
                                    className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded border border-indigo-100 hover:bg-indigo-100 transition-colors font-medium"
                                >
                                    Sync Now
                                </button>
                            </div>
                        ) : filteredTables.length === 0 ? (
                            <div className="p-8 text-center">
                                <p className="text-xs text-slate-400">No tables match "{searchQuery}"</p>
                            </div>
                        ) : (
                            filteredTables.map((table: any) => (
                                <div
                                    key={table._id}
                                    onClick={() => setSelectedItem(table)}
                                    className={`p-4 cursor-pointer transition-all border-l-4 ${selectedItem?._id === table._id ? 'bg-indigo-50/50 border-indigo-500' : 'hover:bg-slate-50 border-transparent'}`}
                                >
                                    <div className="font-semibold text-slate-900 text-sm">{table.name}</div>
                                    <div className="text-[10px] text-slate-400 font-mono mb-2 bg-slate-100 px-1 py-0.5 rounded inline-block">{table.logicalName}</div>
                                    <div className="flex gap-3 text-[11px] text-slate-500">
                                        <span className="flex items-center gap-1"><Layout size={12} /> {table.columns} columns</span>
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

