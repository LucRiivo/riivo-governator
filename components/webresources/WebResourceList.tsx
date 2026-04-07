import { useAction, useQuery } from "convex/react";
import React, { useState, useMemo } from 'react';
import { api } from "@/convex/_generated/api";
import {
    Code2,
    RefreshCw,
    FileCode,
    FileType,
    Image,
    FileText,
    Filter,
    CheckCircle,
} from 'lucide-react';

interface WebResourceListProps {
    selectedItem: any;
    setSelectedItem: (item: any) => void;
    activeTenantId?: string;
    orgId?: string;
    searchQuery?: string;
}

const WEB_RESOURCE_TYPE_LABELS: Record<number, { label: string; short: string; color: string }> = {
    1: { label: "HTML", short: "HTML", color: "bg-orange-50 text-orange-600 border-orange-100" },
    2: { label: "CSS", short: "CSS", color: "bg-blue-50 text-blue-600 border-blue-100" },
    3: { label: "JavaScript", short: "JS", color: "bg-amber-50 text-amber-600 border-amber-100" },
    4: { label: "XML", short: "XML", color: "bg-emerald-50 text-emerald-600 border-emerald-100" },
    5: { label: "PNG", short: "PNG", color: "bg-pink-50 text-pink-600 border-pink-100" },
    6: { label: "JPG", short: "JPG", color: "bg-pink-50 text-pink-600 border-pink-100" },
    7: { label: "GIF", short: "GIF", color: "bg-pink-50 text-pink-600 border-pink-100" },
    8: { label: "Silverlight", short: "XAP", color: "bg-slate-50 text-slate-600 border-slate-100" },
    9: { label: "XSL", short: "XSL", color: "bg-emerald-50 text-emerald-600 border-emerald-100" },
    10: { label: "ICO", short: "ICO", color: "bg-pink-50 text-pink-600 border-pink-100" },
    11: { label: "SVG", short: "SVG", color: "bg-violet-50 text-violet-600 border-violet-100" },
    12: { label: "RESX", short: "RESX", color: "bg-slate-50 text-slate-600 border-slate-100" },
};

function TypeBadge({ type }: { type: number }) {
    const config = WEB_RESOURCE_TYPE_LABELS[type] || { label: `Type ${type}`, short: `T${type}`, color: "bg-slate-50 text-slate-600 border-slate-100" };
    return (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${config.color}`}>
            {config.short}
        </span>
    );
}

function getResourceIcon(type: number) {
    if (type === 3) return <FileCode size={14} />;
    if (type === 1 || type === 4 || type === 9 || type === 12) return <FileText size={14} />;
    if (type === 2) return <FileType size={14} />;
    if ([5, 6, 7, 10, 11].includes(type)) return <Image size={14} />;
    return <Code2 size={14} />;
}

type FilterType = 'all' | 'code' | 'images' | 'other';

export default function WebResourceList({
    selectedItem,
    setSelectedItem,
    activeTenantId,
    orgId,
    searchQuery = ''
}: WebResourceListProps) {
    // @ts-ignore TS2589 type depth limit with large Convex schema
    const listWebResources = useAction(api.actions.webresources.listWebResources);
    const cachedResources = useQuery(api.queries.getWebResources, activeTenantId ? { tenantId: activeTenantId } : "skip");

    const [isSyncing, setIsSyncing] = useState(false);
    const [filterType, setFilterType] = useState<FilterType>('all');

    const handleSync = async () => {
        if (!activeTenantId) return;
        setIsSyncing(true);
        try {
            await listWebResources({ tenantId: activeTenantId, orgId });
        } catch (error) {
            console.error("Web resources sync failed:", error);
        } finally {
            setIsSyncing(false);
        }
    };

    const lastSynced = cachedResources && cachedResources.length > 0
        ? Math.max(...cachedResources.map((r: any) => r.lastSynced || 0))
        : null;

    const formatTimeAgo = (timestamp: number) => {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return 'just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        return `${hours}h ago`;
    };

    // Filter and search
    const filteredResources = useMemo(() => {
        if (!cachedResources) return [];

        const IGNORED_PREFIXES = ['mspp_bootstrap_glyphicons', 'cat'];
        let filtered = cachedResources.filter((r: any) =>
            !IGNORED_PREFIXES.some(prefix => r.name.toLowerCase().startsWith(prefix))
        );

        // Apply type filter
        if (filterType === 'code') {
            filtered = filtered.filter((r: any) => [1, 2, 3, 4, 9, 12].includes(r.webResourceType));
        } else if (filterType === 'images') {
            filtered = filtered.filter((r: any) => [5, 6, 7, 10, 11].includes(r.webResourceType));
        } else if (filterType === 'other') {
            filtered = filtered.filter((r: any) => [8].includes(r.webResourceType));
        }

        // Apply search
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter((r: any) =>
                r.name.toLowerCase().includes(q) ||
                (r.displayName && r.displayName.toLowerCase().includes(q))
            );
        }

        return filtered;
    }, [cachedResources, filterType, searchQuery]);

    // Stats for filter buttons
    const stats = useMemo(() => {
        if (!cachedResources) return { all: 0, code: 0, images: 0, other: 0 };
        return {
            all: cachedResources.length,
            code: cachedResources.filter((r: any) => [1, 2, 3, 4, 9, 12].includes(r.webResourceType)).length,
            images: cachedResources.filter((r: any) => [5, 6, 7, 10, 11].includes(r.webResourceType)).length,
            other: cachedResources.filter((r: any) => [8].includes(r.webResourceType)).length,
        };
    }, [cachedResources]);

    return (
        <div className="w-80 border-r border-slate-200 overflow-y-auto bg-white shadow-sm z-0">
            <div className="p-4 border-b border-slate-100 sticky top-0 bg-white/90 backdrop-blur-md z-10">
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <h2 className="font-bold text-slate-800 text-xs tracking-wider uppercase mb-0.5">
                            Web Resources
                        </h2>
                        {lastSynced && (
                            <p className="text-[10px] text-slate-400 font-medium">
                                Synced {formatTimeAgo(lastSynced)}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={handleSync}
                        disabled={isSyncing}
                        className={`text-slate-400 hover:text-indigo-600 transition-colors p-1 rounded-md hover:bg-slate-100 ${isSyncing ? 'animate-spin text-indigo-600' : ''}`}
                        title="Sync Web Resources from Dynamics"
                    >
                        <RefreshCw size={14} />
                    </button>
                </div>

                {/* Filter Chips */}
                {cachedResources && cachedResources.length > 0 && (
                    <div className="flex gap-1">
                        {([
                            { key: 'all' as FilterType, label: 'All', count: stats.all },
                            { key: 'code' as FilterType, label: 'Code', count: stats.code },
                            { key: 'images' as FilterType, label: 'Images', count: stats.images },
                        ]).map(f => (
                            <button
                                key={f.key}
                                onClick={() => setFilterType(f.key)}
                                className={`text-[10px] px-2 py-1 rounded-full font-medium transition-all ${filterType === f.key
                                    ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                                    : 'bg-slate-50 text-slate-500 border border-slate-100 hover:bg-slate-100'
                                    }`}
                            >
                                {f.label} ({f.count})
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="divide-y divide-slate-50">
                {!cachedResources ? (
                    <div className="p-4 text-xs text-slate-400 text-center">Loading cache...</div>
                ) : cachedResources.length === 0 ? (
                    <div className="p-8 text-center">
                        <p className="text-xs text-slate-400 mb-3">No web resources found.</p>
                        <button
                            onClick={handleSync}
                            className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded border border-indigo-100 hover:bg-indigo-100 transition-colors font-medium"
                        >
                            Sync Now
                        </button>
                    </div>
                ) : filteredResources.length === 0 ? (
                    <div className="p-8 text-center">
                        <p className="text-xs text-slate-400">No resources match your filter</p>
                    </div>
                ) : (
                    filteredResources.map((wr: any) => (
                        <div
                            key={wr._id}
                            onClick={() => setSelectedItem(wr)}
                            className={`p-4 cursor-pointer transition-all border-l-4 ${selectedItem?._id === wr._id ? 'bg-indigo-50/50 border-indigo-500' : 'hover:bg-slate-50 border-transparent'
                                }`}
                        >
                            <div className="flex justify-between items-start mb-1">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <span className={selectedItem?._id === wr._id ? "text-indigo-500" : "text-slate-400"}>
                                        {getResourceIcon(wr.webResourceType)}
                                    </span>
                                    <span className="font-semibold text-slate-900 text-sm truncate">
                                        {wr.displayName || wr.name.split('/').pop() || wr.name}
                                    </span>
                                </div>
                                <TypeBadge type={wr.webResourceType} />
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono truncate ml-6 mb-1">{wr.name}</div>
                            <div className="flex gap-3 text-[11px] text-slate-500 font-medium ml-6">
                                {wr.isManaged ? (
                                    <span className="text-sky-500">Managed</span>
                                ) : (
                                    <span className="text-amber-500">Unmanaged</span>
                                )}
                                {wr.modifiedOn && (
                                    <span className="opacity-70">
                                        {new Date(wr.modifiedOn).toLocaleDateString()}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
