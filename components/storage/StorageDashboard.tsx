import React, { useState, useCallback } from 'react';
import {
    HardDrive, RefreshCw, Database, FileText, ScrollText,
    AlertTriangle, TrendingUp, Loader2, Settings, Sparkles,
    BarChart3, Table2, Lightbulb, CheckCircle2, XCircle,
    AlertCircle, Info
} from 'lucide-react';
import { useQuery, useAction } from 'convex/react';
import { api } from '@/convex/_generated/api';

type StorageSubTab = 'overview' | 'breakdown' | 'recommendations';

interface StorageDashboardProps {
    activeTenant: any;
    orgId?: string;
    onOpenSettings?: () => void;
}

function formatMB(mb: number): string {
    if (!mb || mb === 0) return '0 MB';
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${Math.round(mb)} MB`;
}

function formatNumber(num: number): string {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
}

function getUsageColor(percent: number): string {
    if (percent >= 90) return 'text-rose-600';
    if (percent >= 75) return 'text-amber-600';
    if (percent >= 50) return 'text-blue-600';
    return 'text-emerald-600';
}

function getUsageBarColor(percent: number): string {
    if (percent >= 90) return 'bg-rose-500';
    if (percent >= 75) return 'bg-amber-500';
    if (percent >= 50) return 'bg-blue-500';
    return 'bg-emerald-500';
}

function getUsageBgColor(percent: number): string {
    if (percent >= 90) return 'bg-rose-50';
    if (percent >= 75) return 'bg-amber-50';
    if (percent >= 50) return 'bg-blue-50';
    return 'bg-emerald-50';
}

export default function StorageDashboard({ activeTenant, orgId, onOpenSettings }: StorageDashboardProps) {
    const [activeSubTab, setActiveSubTab] = useState<StorageSubTab>('overview');
    const [syncing, setSyncing] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);
    const [auditLoading, setAuditLoading] = useState(false);

    const tenantId = activeTenant?.tenantId;

    // Check if PP Admin is connected
    const connection = useQuery(
        api.queries.getPPAdminConnection,
        tenantId ? { tenantId } : "skip"
    );

    // Get cached storage data
    const environmentStorage = useQuery(
        api.queries.getEnvironmentStorage,
        tenantId ? { tenantId } : "skip"
    ) || [];

    // Get cached audit result
    const auditResult = useQuery(
        api.queries.getStorageAuditResult,
        tenantId ? { tenantId } : "skip"
    );

    const parsedAudit = auditResult ? (() => {
        try { return JSON.parse(auditResult.result); } catch { return null; }
    })() : null;

    // Actions
    const syncAllStorage = useAction(api.actions.storage.syncAllStorage);
    const analyzeStorage = useAction(api.actions.storageAudit.analyzeStorageOverview);

    const handleSync = async () => {
        if (!tenantId) return;
        setSyncing(true);
        setSyncError(null);
        try {
            await syncAllStorage({ tenantId, orgId });
        } catch (error: any) {
            console.error("Storage sync failed:", error);
            setSyncError(error.message || 'Sync failed');
        } finally {
            setSyncing(false);
        }
    };

    const handleAnalyze = async () => {
        if (!tenantId) return;
        setAuditLoading(true);
        try {
            await analyzeStorage({ tenantId, orgId, forceRefresh: true });
        } catch (error: any) {
            console.error("Storage analysis failed:", error);
            setSyncError(error.message || 'Analysis failed');
        } finally {
            setAuditLoading(false);
        }
    };

    const lastSyncedAt = environmentStorage.length > 0
        ? Math.max(...environmentStorage.map((e: any) => e.snapshotDate))
        : null;

    // Not connected state
    if (!connection) {
        return (
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center max-w-md">
                    <div className="bg-teal-100 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6">
                        <HardDrive size={36} className="text-teal-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800 mb-2">Environment Storage</h2>
                    <p className="text-slate-500 mb-6">
                        Connect to the Power Platform Admin API to view environment capacity,
                        storage breakdown, and AI-powered optimization recommendations.
                    </p>
                    <button
                        onClick={onOpenSettings}
                        className="bg-teal-600 text-white px-6 py-3 rounded-2xl font-semibold hover:bg-teal-700 transition-all shadow-lg shadow-teal-600/20 flex items-center gap-2 mx-auto"
                    >
                        <Settings size={18} />
                        Connect PP Admin API
                    </button>
                </div>
            </div>
        );
    }

    const subTabs: { id: StorageSubTab; label: string; icon: React.ReactNode; count?: number }[] = [
        { id: 'overview', label: 'Overview', icon: <BarChart3 size={16} />, count: environmentStorage.length },
        { id: 'breakdown', label: 'Table Breakdown', icon: <Table2 size={16} /> },
        { id: 'recommendations', label: 'AI Recommendations', icon: <Sparkles size={16} /> },
    ];

    return (
        <div className="flex-1 flex flex-col min-h-0">
            {/* Top Bar */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                        <HardDrive size={28} className="text-teal-600" />
                        Environment Storage
                    </h2>
                    <p className="text-sm text-slate-400 mt-0.5 flex items-center gap-2">
                        {connection.displayName || 'Power Platform Admin'}
                        {lastSyncedAt && (
                            <span className="text-slate-300">
                                &middot; Last synced {new Date(lastSyncedAt).toLocaleString()}
                            </span>
                        )}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {environmentStorage.length > 0 && (
                        <button
                            onClick={handleAnalyze}
                            disabled={auditLoading}
                            className="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl font-semibold hover:bg-slate-50 transition-all flex items-center gap-2 text-sm disabled:opacity-50"
                        >
                            {auditLoading ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <Sparkles size={16} className="text-amber-500" />
                            )}
                            {auditLoading ? 'Analyzing...' : 'AI Analysis'}
                        </button>
                    )}
                    <button
                        onClick={handleSync}
                        disabled={syncing}
                        className="bg-teal-600 text-white px-4 py-2 rounded-xl font-semibold hover:bg-teal-700 transition-all flex items-center gap-2 text-sm disabled:opacity-50 shadow-lg shadow-teal-600/10"
                    >
                        {syncing ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : (
                            <RefreshCw size={16} />
                        )}
                        {syncing ? 'Syncing...' : 'Sync Storage'}
                    </button>
                </div>
            </div>

            {/* Sync Error */}
            {syncError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 mb-4 text-sm flex items-center gap-2">
                    <AlertTriangle size={16} />
                    {syncError}
                </div>
            )}

            {/* Sub Tabs */}
            <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-xl w-fit">
                {subTabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveSubTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeSubTab === tab.id
                            ? 'bg-white text-teal-700 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        {tab.icon}
                        {tab.label}
                        {tab.count !== undefined && tab.count > 0 && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeSubTab === tab.id ? 'bg-teal-100 text-teal-600' : 'bg-slate-200 text-slate-500'
                                }`}>
                                {tab.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {activeSubTab === 'overview' && (
                    <StorageOverview
                        environments={environmentStorage}
                        loading={syncing}
                    />
                )}
                {activeSubTab === 'breakdown' && (
                    <StorageBreakdown
                        environments={environmentStorage}
                        loading={syncing}
                    />
                )}
                {activeSubTab === 'recommendations' && (
                    <StorageRecommendations
                        audit={parsedAudit}
                        loading={auditLoading}
                        onAnalyze={handleAnalyze}
                        hasData={environmentStorage.length > 0}
                    />
                )}
            </div>
        </div>
    );
}

// Storage Overview Sub-component
function StorageOverview({ environments, loading }: { environments: any[]; loading: boolean }) {
    if (environments.length === 0 && !loading) {
        return (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                <TrendingUp size={40} className="mx-auto text-slate-300 mb-3" />
                <h3 className="font-semibold text-slate-600 mb-1">No Storage Data Yet</h3>
                <p className="text-sm text-slate-400">
                    Click &ldquo;Sync Storage&rdquo; to fetch environment capacity data from the Power Platform Admin API.
                </p>
            </div>
        );
    }

    // Compute aggregates
    const totalDb = environments.reduce((s, e) => s + (e.dbCapacityMB || 0), 0);
    const totalDbUsed = environments.reduce((s, e) => s + (e.dbUsedMB || 0), 0);
    const totalFile = environments.reduce((s, e) => s + (e.fileCapacityMB || 0), 0);
    const totalFileUsed = environments.reduce((s, e) => s + (e.fileUsedMB || 0), 0);
    const totalLog = environments.reduce((s, e) => s + (e.logCapacityMB || 0), 0);
    const totalLogUsed = environments.reduce((s, e) => s + (e.logUsedMB || 0), 0);

    const totalCapacity = totalDb + totalFile + totalLog;
    const totalUsed = totalDbUsed + totalFileUsed + totalLogUsed;

    const summaryCards = [
        {
            icon: <Database size={20} />,
            iconBg: 'bg-blue-50',
            iconColor: 'text-blue-600',
            label: 'Database',
            capacity: totalDb,
            used: totalDbUsed,
        },
        {
            icon: <FileText size={20} />,
            iconBg: 'bg-violet-50',
            iconColor: 'text-violet-600',
            label: 'File',
            capacity: totalFile,
            used: totalFileUsed,
        },
        {
            icon: <ScrollText size={20} />,
            iconBg: 'bg-amber-50',
            iconColor: 'text-amber-600',
            label: 'Log',
            capacity: totalLog,
            used: totalLogUsed,
        },
        {
            icon: <HardDrive size={20} />,
            iconBg: 'bg-teal-50',
            iconColor: 'text-teal-600',
            label: 'Total',
            capacity: totalCapacity,
            used: totalUsed,
        },
    ];

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {summaryCards.map((card, i) => {
                    const percent = card.capacity > 0 ? Math.round(card.used / card.capacity * 100) : 0;
                    return (
                        <div
                            key={i}
                            className={`bg-white rounded-2xl border border-slate-200 p-5 ${loading ? 'animate-pulse' : ''}`}
                        >
                            <div className={`${card.iconBg} w-10 h-10 rounded-xl flex items-center justify-center mb-3`}>
                                <span className={card.iconColor}>{card.icon}</span>
                            </div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                {card.label} Storage
                            </div>
                            <div className="text-2xl font-bold text-slate-800">
                                {loading && card.capacity === 0 ? (
                                    <div className="h-8 bg-slate-200 rounded w-20" />
                                ) : (
                                    formatMB(card.used)
                                )}
                            </div>
                            <div className="text-xs text-slate-400 mt-1">
                                of {formatMB(card.capacity)} capacity
                            </div>
                            {/* Progress bar */}
                            <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all ${getUsageBarColor(percent)}`}
                                    style={{ width: `${Math.min(percent, 100)}%` }}
                                />
                            </div>
                            <div className={`text-xs font-semibold mt-1 ${getUsageColor(percent)}`}>
                                {percent}% used
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Per-Environment Breakdown */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                    <h3 className="font-semibold text-slate-700 text-sm flex items-center gap-2">
                        <BarChart3 size={16} className="text-teal-500" />
                        Environment Capacity ({environments.length} environments)
                    </h3>
                </div>

                <div className="divide-y divide-slate-50">
                    {environments.map((env: any, i: number) => {
                        const dbPercent = env.dbCapacityMB > 0 ? Math.round((env.dbUsedMB || 0) / env.dbCapacityMB * 100) : 0;
                        const filePercent = env.fileCapacityMB > 0 ? Math.round((env.fileUsedMB || 0) / env.fileCapacityMB * 100) : 0;
                        const logPercent = env.logCapacityMB > 0 ? Math.round((env.logUsedMB || 0) / env.logCapacityMB * 100) : 0;
                        const totalEnvCapacity = env.dbCapacityMB + env.fileCapacityMB + env.logCapacityMB;
                        const totalEnvUsed = (env.dbUsedMB || 0) + (env.fileUsedMB || 0) + (env.logUsedMB || 0);
                        const totalPercent = totalEnvCapacity > 0 ? Math.round(totalEnvUsed / totalEnvCapacity * 100) : 0;

                        return (
                            <div key={i} className="px-6 py-4 hover:bg-slate-50/50 transition-colors">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-3 h-3 rounded-full ${getUsageBarColor(totalPercent)}`} />
                                        <div>
                                            <p className="font-semibold text-slate-700 text-sm">{env.envName}</p>
                                            <p className="text-[10px] text-slate-400">
                                                {env.envType && <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 mr-1">{env.envType}</span>}
                                                {env.envState && <span className="text-slate-400">{env.envState}</span>}
                                            </p>
                                        </div>
                                    </div>
                                    <div className={`text-sm font-bold ${getUsageColor(totalPercent)}`}>
                                        {formatMB(totalEnvUsed)} / {formatMB(totalEnvCapacity)}
                                    </div>
                                </div>

                                {/* Capacity bars */}
                                <div className="grid grid-cols-3 gap-4">
                                    <CapacityBar label="Database" used={env.dbUsedMB || 0} capacity={env.dbCapacityMB} percent={dbPercent} />
                                    <CapacityBar label="File" used={env.fileUsedMB || 0} capacity={env.fileCapacityMB} percent={filePercent} />
                                    <CapacityBar label="Log" used={env.logUsedMB || 0} capacity={env.logCapacityMB} percent={logPercent} />
                                </div>
                            </div>
                        );
                    })}
                </div>

                {environments.length === 0 && (
                    <div className="px-6 py-8 text-center text-sm text-slate-400">
                        No environments found. Try syncing storage data.
                    </div>
                )}
            </div>
        </div>
    );
}

function CapacityBar({ label, used, capacity, percent }: { label: string; used: number; capacity: number; percent: number }) {
    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
                <span className={`text-[10px] font-semibold ${getUsageColor(percent)}`}>{percent}%</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all ${getUsageBarColor(percent)}`}
                    style={{ width: `${Math.min(percent, 100)}%` }}
                />
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
                {formatMB(used)} / {formatMB(capacity)}
            </div>
        </div>
    );
}

// Storage Breakdown Sub-component (Table-level)
function StorageBreakdown({ environments, loading }: { environments: any[]; loading: boolean }) {
    // Collect all table breakdowns across environments
    const allTables: any[] = [];
    environments.forEach((env: any) => {
        if (env.tableBreakdown) {
            try {
                const tables = JSON.parse(env.tableBreakdown);
                tables.forEach((t: any) => {
                    allTables.push({ ...t, envName: env.envName });
                });
            } catch { }
        }
    });

    // Sort by record count descending
    allTables.sort((a, b) => b.recordCount - a.recordCount);

    if (allTables.length === 0 && !loading) {
        return (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                <Table2 size={40} className="mx-auto text-slate-300 mb-3" />
                <h3 className="font-semibold text-slate-600 mb-1">No Table Data Yet</h3>
                <p className="text-sm text-slate-400">
                    Table-level breakdown is fetched from D365 during storage sync.
                    Click &ldquo;Sync Storage&rdquo; to populate this data.
                </p>
            </div>
        );
    }

    // Compute totals for the top bar
    const totalRecords = allTables.reduce((s, t) => s + (t.recordCount > 0 ? t.recordCount : 0), 0);
    const customTables = allTables.filter(t => t.isCustom);
    const managedTables = allTables.filter(t => t.isManaged);

    return (
        <div className="space-y-4">
            {/* Stats bar */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tables Tracked</div>
                    <div className="text-xl font-bold text-slate-800 mt-1">{allTables.length}</div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Records</div>
                    <div className="text-xl font-bold text-slate-800 mt-1">{formatNumber(totalRecords)}</div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Custom Tables</div>
                    <div className="text-xl font-bold text-slate-800 mt-1">{customTables.length}</div>
                </div>
            </div>

            {/* Table list */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                    <h3 className="font-semibold text-slate-700 text-sm flex items-center gap-2">
                        <Table2 size={16} className="text-teal-500" />
                        Top Tables by Record Count
                    </h3>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-100">
                                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider px-6 py-3">#</th>
                                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider px-6 py-3">Table</th>
                                <th className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider px-6 py-3">Logical Name</th>
                                <th className="text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider px-6 py-3">Records</th>
                                <th className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider px-6 py-3">Type</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {allTables.slice(0, 50).map((table, i) => {
                                const recordPercent = totalRecords > 0 ? (table.recordCount / totalRecords * 100) : 0;
                                return (
                                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-3 text-sm text-slate-400 font-mono">{i + 1}</td>
                                        <td className="px-6 py-3">
                                            <p className="text-sm font-medium text-slate-700">{table.displayName}</p>
                                        </td>
                                        <td className="px-6 py-3">
                                            <p className="text-xs font-mono text-slate-400">{table.logicalName}</p>
                                        </td>
                                        <td className="px-6 py-3 text-right">
                                            <div className="flex items-center justify-end gap-3">
                                                <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-teal-500 rounded-full"
                                                        style={{ width: `${Math.min(recordPercent * 2, 100)}%` }}
                                                    />
                                                </div>
                                                <span className="text-sm font-semibold text-slate-700 tabular-nums">
                                                    {formatNumber(table.recordCount)}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-3 text-center">
                                            {table.isCustom ? (
                                                <span className="text-[10px] font-bold bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">Custom</span>
                                            ) : table.isManaged ? (
                                                <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Managed</span>
                                            ) : (
                                                <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">System</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {allTables.length > 50 && (
                    <div className="px-6 py-3 border-t border-slate-100 text-xs text-slate-400 text-center">
                        Showing top 50 of {allTables.length} tables
                    </div>
                )}
            </div>
        </div>
    );
}

// Storage Recommendations Sub-component (AI-powered)
function StorageRecommendations({ audit, loading, onAnalyze, hasData }: { audit: any; loading: boolean; onAnalyze: () => void; hasData: boolean }) {
    if (!audit && !loading) {
        return (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                <Sparkles size={40} className="mx-auto text-amber-400 mb-3" />
                <h3 className="font-semibold text-slate-600 mb-1">AI Storage Analysis</h3>
                <p className="text-sm text-slate-400 mb-4">
                    {hasData
                        ? 'Run AI analysis to get personalized storage optimization recommendations.'
                        : 'Sync storage data first, then run AI analysis for recommendations.'
                    }
                </p>
                {hasData && (
                    <button
                        onClick={onAnalyze}
                        className="bg-amber-500 text-white px-6 py-3 rounded-2xl font-semibold hover:bg-amber-600 transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2 mx-auto"
                    >
                        <Sparkles size={18} />
                        Analyze Storage
                    </button>
                )}
            </div>
        );
    }

    if (loading) {
        return (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                <Loader2 size={40} className="mx-auto text-amber-500 mb-3 animate-spin" />
                <h3 className="font-semibold text-slate-600 mb-1">Analyzing Storage...</h3>
                <p className="text-sm text-slate-400">
                    Claude is reviewing your environment storage data and generating recommendations.
                </p>
            </div>
        );
    }

    const findingIcon = (type: string) => {
        switch (type) {
            case 'error': return <XCircle size={16} className="text-rose-500 mt-0.5 shrink-0" />;
            case 'warning': return <AlertCircle size={16} className="text-amber-500 mt-0.5 shrink-0" />;
            default: return <Info size={16} className="text-blue-500 mt-0.5 shrink-0" />;
        }
    };

    const findingBg = (type: string) => {
        switch (type) {
            case 'error': return 'border-l-rose-500 bg-rose-50/30';
            case 'warning': return 'border-l-amber-500 bg-amber-50/30';
            default: return 'border-l-blue-500 bg-blue-50/30';
        }
    };

    return (
        <div className="space-y-6">
            {/* Score Overview */}
            {audit.overallScore !== undefined && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                    <div className="flex items-center gap-6">
                        <div className="relative">
                            <svg className="w-24 h-24 -rotate-90" viewBox="0 0 120 120">
                                <circle cx="60" cy="60" r="50" fill="none" stroke="#f1f5f9" strokeWidth="10" />
                                <circle
                                    cx="60" cy="60" r="50" fill="none"
                                    stroke={audit.overallScore >= 70 ? '#10b981' : audit.overallScore >= 50 ? '#f59e0b' : '#ef4444'}
                                    strokeWidth="10"
                                    strokeDasharray={`${audit.overallScore * 3.14} 314`}
                                    strokeLinecap="round"
                                />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-2xl font-bold text-slate-800">{audit.overallScore}</span>
                            </div>
                        </div>
                        <div className="flex-1">
                            <h3 className="font-bold text-slate-800 text-lg mb-1">Storage Health Score</h3>
                            <p className="text-sm text-slate-500 mb-3">{audit.summary}</p>
                            {audit.categories && (
                                <div className="grid grid-cols-2 gap-2">
                                    {Object.values(audit.categories).map((cat: any, i: number) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${cat.score >= 70 ? 'bg-emerald-500' : cat.score >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`} />
                                            <span className="text-xs text-slate-500">{cat.label}</span>
                                            <span className={`text-xs font-bold ${cat.score >= 70 ? 'text-emerald-600' : cat.score >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                                                {cat.score}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Stats */}
            {audit.stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard label="Environments" value={audit.stats.totalEnvironments} />
                    <StatCard label="DB Used" value={formatMB(audit.stats.totalDbUsedMB)} sub={`of ${formatMB(audit.stats.totalDbCapacityMB)}`} />
                    <StatCard label="File Used" value={formatMB(audit.stats.totalFileUsedMB)} sub={`of ${formatMB(audit.stats.totalFileCapacityMB)}`} />
                    <StatCard label="Log Used" value={formatMB(audit.stats.totalLogUsedMB)} sub={`of ${formatMB(audit.stats.totalLogCapacityMB)}`} />
                </div>
            )}

            {/* Findings */}
            {audit.findings && audit.findings.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100">
                        <h3 className="font-semibold text-slate-700 text-sm flex items-center gap-2">
                            <Lightbulb size={16} className="text-amber-500" />
                            Findings & Recommendations ({audit.findings.length})
                        </h3>
                    </div>
                    <div className="divide-y divide-slate-50">
                        {audit.findings.map((finding: any, i: number) => (
                            <div key={i} className={`px-6 py-4 border-l-4 ${findingBg(finding.type)}`}>
                                <div className="flex items-start gap-3">
                                    {findingIcon(finding.type)}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-semibold text-sm text-slate-700">{finding.title}</span>
                                            <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                                                {finding.category}
                                            </span>
                                            {finding.estimatedSavingsMB > 0 && (
                                                <span className="text-[10px] font-bold bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded">
                                                    ~{formatMB(finding.estimatedSavingsMB)} savings
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-slate-500 mb-2">{finding.description}</p>
                                        {finding.suggestion && (
                                            <div className="bg-white/60 rounded-lg px-3 py-2 border border-slate-100">
                                                <p className="text-xs text-slate-600">
                                                    <span className="font-semibold text-teal-600">Suggestion: </span>
                                                    {finding.suggestion}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
    return (
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</div>
            <div className="text-xl font-bold text-slate-800 mt-1">{value}</div>
            {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
        </div>
    );
}
