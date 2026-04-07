import { useAction, useQuery } from "convex/react";
import React, { useState, useMemo } from 'react';
import { api } from "@/convex/_generated/api";
import {
    LayoutGrid,
    Zap,
    RefreshCw,
    CheckCircle,
    AlertTriangle,
    Info,
    XCircle,
    Globe,
    Box,
    FileText,
    Eye,
    Table,
    BarChart3,
    ShieldAlert,
    GitBranch,
} from 'lucide-react';
import { Tenant } from '../Sidebar';
import ERDViewer from '../ERDViewer';
import EntityDocumentationEditor from '../EntityDocumentationEditor';

interface AppDetailViewProps {
    selectedItem: any;
    activeTenant: Tenant | null;
    orgId?: string;
}

const FORM_TYPE_LABELS: Record<number, { label: string; color: string }> = {
    2: { label: "Main", color: "bg-indigo-50 text-indigo-600" },
    5: { label: "Mobile", color: "bg-cyan-50 text-cyan-600" },
    6: { label: "Quick View", color: "bg-amber-50 text-amber-600" },
    7: { label: "Quick Create", color: "bg-emerald-50 text-emerald-600" },
    11: { label: "Interactive", color: "bg-violet-50 text-violet-600" },
};

function ScoreRing({ score, size = 80, label }: { score: number; size?: number; label?: string }) {
    const radius = (size - 8) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;
    const getColor = (s: number) => {
        if (s >= 90) return { stroke: "#10b981", text: "text-emerald-500" };
        if (s >= 70) return { stroke: "#3b82f6", text: "text-blue-500" };
        if (s >= 50) return { stroke: "#f59e0b", text: "text-amber-500" };
        return { stroke: "#ef4444", text: "text-rose-500" };
    };
    const color = getColor(score);
    return (
        <div className="flex flex-col items-center gap-1">
            <div className="relative" style={{ width: size, height: size }}>
                <svg width={size} height={size} className="-rotate-90">
                    <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e2e8f0" strokeWidth="6" />
                    <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color.stroke} strokeWidth="6"
                        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
                        className="transition-all duration-1000 ease-out" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`text-lg font-bold ${color.text}`}>{score}</span>
                </div>
            </div>
            {label && <span className="text-[10px] font-medium text-slate-500 text-center">{label}</span>}
        </div>
    );
}

export default function AppDetailView({ selectedItem, activeTenant, orgId }: AppDetailViewProps) {
    const analyzeAppLandscape = useAction(api.actions.appLandscapeAudit.analyzeAppLandscape);
    const analyzeApp = useAction(api.actions.appLandscapeAudit.analyzeApp);

    const allForms = useQuery(api.queries.getSystemForms, activeTenant?.tenantId ? { tenantId: activeTenant.tenantId } : "skip") || [];
    const allViews = useQuery(api.queries.getSystemViews, activeTenant?.tenantId ? { tenantId: activeTenant.tenantId } : "skip") || [];
    const allApps = useQuery(api.queries.getModelDrivenApps, activeTenant?.tenantId ? { tenantId: activeTenant.tenantId } : "skip") || [];

    const cachedAudit = useQuery(
        api.queries.getAppLandscapeAuditResult,
        activeTenant?.tenantId ? { tenantId: activeTenant.tenantId } : "skip"
    );

    // Per-app audit cache query (only when an app is selected)
    const cachedAppAudit = useQuery(
        api.queries.getAppAuditResult,
        selectedItem?._id ? { appId: selectedItem._id } : "skip"
    );

    const [isAuditing, setIsAuditing] = useState(false);
    const [auditResult, setAuditResult] = useState<any>(null);
    const [isAnalyzingApp, setIsAnalyzingApp] = useState(false);
    const [appAuditResult, setAppAuditResult] = useState<any>(null);
    const [detailTab, setDetailTab] = useState<'audit' | 'erd' | 'docs'>('audit');

    const displayAudit = useMemo(() => {
        if (auditResult) return auditResult;
        if (cachedAudit?.result) {
            try { return JSON.parse(cachedAudit.result); }
            catch { return null; }
        }
        return null;
    }, [auditResult, cachedAudit]);

    const displayAppAudit = useMemo(() => {
        if (appAuditResult) return appAuditResult;
        if (cachedAppAudit?.result) {
            try { return JSON.parse(cachedAppAudit.result); }
            catch { return null; }
        }
        return null;
    }, [appAuditResult, cachedAppAudit]);

    // Reset per-app audit result and tab when selected item changes
    React.useEffect(() => {
        setAppAuditResult(null);
        setDetailTab('audit');
    }, [selectedItem?._id]);

    const handleRunAudit = async () => {
        if (!activeTenant?.tenantId) return;
        setIsAuditing(true);
        setAuditResult(null);
        try {
            const result = await analyzeAppLandscape({ tenantId: activeTenant.tenantId, orgId, forceRefresh: true });
            setAuditResult(result);
        } catch (error) {
            console.error("App landscape audit failed:", error);
            setAuditResult({
                summary: "Audit failed.",
                overallScore: 0,
                categories: {},
                findings: [{ type: "error", category: "System", title: "Audit Error", description: error instanceof Error ? error.message : "Unknown error", suggestion: "Ensure data is synced first." }],
                stats: {}
            });
        } finally {
            setIsAuditing(false);
        }
    };

    const handleAnalyzeApp = async () => {
        if (!activeTenant?.tenantId || !selectedItem?._id) return;
        setIsAnalyzingApp(true);
        setAppAuditResult(null);
        try {
            const result = await analyzeApp({ tenantId: activeTenant.tenantId, appId: selectedItem._id, forceRefresh: true });
            setAppAuditResult(result);
        } catch (error) {
            console.error("App audit failed:", error);
            setAppAuditResult({
                summary: "Audit failed.",
                overallScore: 0,
                categories: {},
                findings: [{ type: "error", category: "System", title: "Audit Error", description: error instanceof Error ? error.message : "Unknown error", suggestion: "Ensure data is synced first." }],
                stats: {}
            });
        } finally {
            setIsAnalyzingApp(false);
        }
    };

    // Group forms/views by entity (used in both overview and detail views)
    const entityBreakdown = useMemo(() => {
        const map: Record<string, { forms: any[]; views: any[] }> = {};
        for (const f of allForms) {
            if (!map[f.entityLogicalName]) map[f.entityLogicalName] = { forms: [], views: [] };
            map[f.entityLogicalName].forms.push(f);
        }
        for (const v of allViews) {
            if (!map[v.entityLogicalName]) map[v.entityLogicalName] = { forms: [], views: [] };
            map[v.entityLogicalName].views.push(v);
        }
        return Object.entries(map)
            .map(([entity, data]) => ({ entity, ...data }))
            .sort((a, b) => (b.forms.length + b.views.length) - (a.forms.length + a.views.length));
    }, [allForms, allViews]);

    // No item selected -- show landscape overview
    if (!selectedItem) {
        const hasData = allApps.length > 0 || allForms.length > 0 || allViews.length > 0;

        return (
            <div className="space-y-6 max-w-5xl mx-auto">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600"><ShieldAlert size={24} /></div>
                            <div>
                                <h3 className="text-xl font-bold text-slate-800">App Landscape Overview</h3>
                                <p className="text-sm text-slate-500 flex items-center gap-2"><Globe size={12} /> {activeTenant?.url || 'No connection'}</p>
                            </div>
                        </div>
                        <button onClick={handleRunAudit} disabled={isAuditing || !hasData}
                            className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-600/20 active:scale-95 text-sm">
                            {isAuditing ? <RefreshCw className="animate-spin" size={16} /> : <Zap size={16} fill="currentColor" />}
                            {isAuditing ? 'Analyzing...' : (displayAudit ? 'Re-run Audit' : 'Run Landscape Audit')}
                        </button>
                    </div>
                </div>

                {!hasData && (
                    <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                        <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                            <LayoutGrid size={32} className="text-slate-300" />
                        </div>
                        <p className="font-semibold text-slate-500 mb-1">No App Landscape Data Synced</p>
                        <p className="text-sm text-slate-400">Use the sync button in the left panel to fetch apps, forms, and views.</p>
                    </div>
                )}

                {hasData && !displayAudit && (
                    <div className="grid grid-cols-3 gap-4">
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                            <div className="flex items-center gap-2 mb-3"><LayoutGrid size={16} className="text-indigo-500" /><span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Apps</span></div>
                            <p className="text-2xl font-bold text-slate-800">{allApps.length}</p>
                            <p className="text-[11px] text-slate-400 mt-1">{allApps.filter((a: any) => a.clientType === 5).length} Unified Interface</p>
                        </div>
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                            <div className="flex items-center gap-2 mb-3"><FileText size={16} className="text-indigo-500" /><span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Custom Forms</span></div>
                            <p className="text-2xl font-bold text-slate-800">{allForms.length}</p>
                            <p className="text-[11px] text-slate-400 mt-1">{allForms.filter((f: any) => f.formType === 2 || f.formType === 11).length} main forms</p>
                        </div>
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                            <div className="flex items-center gap-2 mb-3"><Eye size={16} className="text-indigo-500" /><span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Custom Views</span></div>
                            <p className="text-2xl font-bold text-slate-800">{allViews.length}</p>
                            <p className="text-[11px] text-slate-400 mt-1">across {entityBreakdown.length} entities</p>
                        </div>
                    </div>
                )}

                {/* Entity breakdown table */}
                {hasData && !displayAudit && entityBreakdown.length > 0 && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
                            <Table size={16} className="text-indigo-600" />
                            <span className="font-semibold text-slate-800">Entity Customization Summary</span>
                            <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">{entityBreakdown.length} entities</span>
                        </div>
                        <div className="max-h-80 overflow-y-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 sticky top-0">
                                    <tr className="text-left text-xs text-slate-500 uppercase tracking-wider">
                                        <th className="px-4 py-3 font-semibold">Entity</th>
                                        <th className="px-4 py-3 font-semibold text-center">Forms</th>
                                        <th className="px-4 py-3 font-semibold text-center">Views</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {entityBreakdown.slice(0, 25).map(({ entity, forms, views }) => (
                                        <tr key={entity} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-3 font-mono text-xs text-slate-700">{entity}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded ${forms.length > 3 ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-600'}`}>{forms.length}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded ${views.length > 10 ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-600'}`}>{views.length}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Audit results */}
                {displayAudit && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                            <div className="flex items-center gap-8">
                                <ScoreRing score={displayAudit.overallScore || 0} size={100} label="Overall" />
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <CheckCircle size={18} className="text-emerald-400" />
                                        <span className="font-semibold text-slate-800">{displayAudit.summary}</span>
                                    </div>
                                    {displayAudit.stats && (
                                        <div className="grid grid-cols-4 gap-4 mt-4">
                                            <div className="text-center"><p className="text-lg font-bold text-slate-700">{displayAudit.stats.totalApps || 0}</p><p className="text-[10px] text-slate-400">Apps</p></div>
                                            <div className="text-center"><p className="text-lg font-bold text-slate-700">{displayAudit.stats.totalForms || 0}</p><p className="text-[10px] text-slate-400">Forms</p></div>
                                            <div className="text-center"><p className="text-lg font-bold text-slate-700">{displayAudit.stats.totalViews || 0}</p><p className="text-[10px] text-slate-400">Views</p></div>
                                            <div className="text-center"><p className="text-lg font-bold text-slate-700">{displayAudit.stats.entitiesCustomized || 0}</p><p className="text-[10px] text-slate-400">Entities</p></div>
                                        </div>
                                    )}
                                </div>
                                {displayAudit.categories && (
                                    <div className="flex gap-4">
                                        {Object.entries(displayAudit.categories).map(([key, cat]: [string, any]) => (
                                            <ScoreRing key={key} score={cat.score || 0} size={64} label={cat.label || key} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {displayAudit.findings?.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {displayAudit.findings.map((finding: any, idx: number) => (
                                    <div key={idx} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
                                        <div className={`h-1.5 w-full ${finding.type === 'error' ? 'bg-rose-500' : finding.type === 'warning' ? 'bg-amber-500' : 'bg-sky-500'}`} />
                                        <div className="p-5 flex-1">
                                            <div className="flex items-center justify-between mb-3">
                                                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded ${finding.type === 'error' ? 'text-rose-600 bg-rose-50' : finding.type === 'warning' ? 'text-amber-600 bg-amber-50' : 'text-sky-600 bg-sky-50'}`}>{finding.category}</span>
                                                {finding.type === 'error' ? <XCircle size={16} className="text-rose-500" /> : finding.type === 'warning' ? <AlertTriangle size={16} className="text-amber-500" /> : <Info size={16} className="text-sky-500" />}
                                            </div>
                                            <h4 className="font-bold text-slate-800 mb-2">{finding.title}</h4>
                                            <p className="text-slate-600 text-sm mb-4 leading-relaxed break-words">{finding.description}</p>
                                            <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100/50 flex items-start gap-3">
                                                <Zap size={16} className="text-indigo-500 mt-0.5 flex-shrink-0" />
                                                <p className="text-sm text-slate-700 italic font-medium break-words flex-1 min-w-0">&quot;{finding.suggestion}&quot;</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    }

    // App selected -- show detail
    const clientTypeLabel = selectedItem.clientType === 5 ? "Unified Interface" : selectedItem.clientType === 4 ? "Web Client" : `Type ${selectedItem.clientType || '?'}`;

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            {/* Header */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600"><LayoutGrid size={24} /></div>
                    <div className="min-w-0 flex-1">
                        <h3 className="text-xl font-bold text-slate-800 truncate">{selectedItem.name}</h3>
                        <div className="flex items-center gap-2 flex-wrap text-sm text-slate-500 mt-0.5">
                            <span className="flex items-center gap-1 truncate"><Globe size={12} /> {activeTenant?.url || 'No connection'}</span>
                            <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-mono">{clientTypeLabel}</span>
                            {selectedItem.isManaged ? (
                                <span className="text-[10px] bg-sky-50 text-sky-600 px-1.5 py-0.5 rounded border border-sky-100 font-bold">Managed</span>
                            ) : (
                                <span className="text-[10px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-100 font-bold">Custom</span>
                            )}
                        </div>
                    </div>
                    <button onClick={handleAnalyzeApp} disabled={isAnalyzingApp}
                        className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-600/20 active:scale-95 text-sm shrink-0">
                        {isAnalyzingApp ? <RefreshCw className="animate-spin" size={14} /> : <Zap size={14} fill="currentColor" />}
                        {isAnalyzingApp ? 'Analyzing...' : (displayAppAudit ? 'Re-analyze' : 'Analyze App')}
                    </button>
                </div>
            </div>

            {/* Detail Tab Toggle */}
            <div className="flex items-center gap-1 bg-white rounded-xl border border-slate-200 p-1 shadow-sm">
                <button
                    onClick={() => setDetailTab('audit')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${detailTab === 'audit' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                    <Zap size={14} />
                    Audit & Details
                </button>
                <button
                    onClick={() => setDetailTab('erd')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${detailTab === 'erd' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                    <GitBranch size={14} />
                    ERD Diagram
                </button>
                <button
                    onClick={() => setDetailTab('docs')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${detailTab === 'docs' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                    <FileText size={14} />
                    Documentation
                </button>
            </div>

            {/* ERD Tab */}
            {detailTab === 'erd' && activeTenant?.tenantId && (
                <ERDViewer
                    tenantId={activeTenant.tenantId}
                    appModuleId={selectedItem.appModuleId}
                    appName={selectedItem.name}
                    orgId={orgId}
                />
            )}

            {/* Documentation Tab */}
            {detailTab === 'docs' && activeTenant?.tenantId && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <EntityDocumentationEditor
                        docType="app"
                        tenantId={activeTenant.tenantId}
                        appId={selectedItem._id}
                        appName={selectedItem.name}
                    />
                </div>
            )}

            {/* Audit Tab Content */}
            {detailTab === 'audit' && <>

            {/* App Properties */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm min-w-0">
                    <p className="text-[10px] uppercase text-slate-400 font-semibold tracking-wider mb-1">Unique Name</p>
                    <p className="text-sm font-mono text-slate-700 truncate">{selectedItem.uniqueName || 'N/A'}</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <p className="text-[10px] uppercase text-slate-400 font-semibold tracking-wider mb-1">Version</p>
                    <p className="text-sm font-medium text-slate-700">{selectedItem.appVersion || 'N/A'}</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <p className="text-[10px] uppercase text-slate-400 font-semibold tracking-wider mb-1">Published</p>
                    <p className="text-sm font-medium text-slate-700">{selectedItem.publishedOn ? new Date(selectedItem.publishedOn).toLocaleDateString() : 'N/A'}</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <p className="text-[10px] uppercase text-slate-400 font-semibold tracking-wider mb-1">Description</p>
                    <p className="text-sm text-slate-700 truncate">{selectedItem.description || 'No description'}</p>
                </div>
            </div>

            {/* Per-App AI Audit Results */}
            {displayAppAudit && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                        <div className="flex items-center gap-8">
                            <ScoreRing score={displayAppAudit.overallScore || 0} size={100} label="Overall" />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-2">
                                    <CheckCircle size={18} className="text-emerald-400 shrink-0" />
                                    <span className="font-semibold text-slate-800">{displayAppAudit.summary}</span>
                                </div>
                                {displayAppAudit.stats && (
                                    <div className="grid grid-cols-3 lg:grid-cols-5 gap-4 mt-4">
                                        <div className="text-center"><p className="text-lg font-bold text-slate-700">{displayAppAudit.stats.entitiesCustomized || 0}</p><p className="text-[10px] text-slate-400">Entities</p></div>
                                        <div className="text-center"><p className="text-lg font-bold text-slate-700">{displayAppAudit.stats.totalForms || 0}</p><p className="text-[10px] text-slate-400">Forms</p></div>
                                        <div className="text-center"><p className="text-lg font-bold text-slate-700">{displayAppAudit.stats.totalViews || 0}</p><p className="text-[10px] text-slate-400">Views</p></div>
                                        <div className="text-center"><p className={`text-lg font-bold ${(displayAppAudit.stats.entitiesWithExcessForms || 0) > 0 ? 'text-amber-600' : 'text-slate-700'}`}>{displayAppAudit.stats.entitiesWithExcessForms || 0}</p><p className="text-[10px] text-slate-400">Excess Forms</p></div>
                                        <div className="text-center"><p className={`text-lg font-bold ${(displayAppAudit.stats.entitiesWithExcessViews || 0) > 0 ? 'text-amber-600' : 'text-slate-700'}`}>{displayAppAudit.stats.entitiesWithExcessViews || 0}</p><p className="text-[10px] text-slate-400">Excess Views</p></div>
                                    </div>
                                )}
                            </div>
                            {displayAppAudit.categories && (
                                <div className="flex gap-3 flex-wrap justify-end shrink-0">
                                    {Object.entries(displayAppAudit.categories).map(([key, cat]: [string, any]) => (
                                        <ScoreRing key={key} score={cat.score || 0} size={60} label={cat.label || key} />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {displayAppAudit.findings?.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {displayAppAudit.findings.map((finding: any, idx: number) => (
                                <div key={idx} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
                                    <div className={`h-1.5 w-full ${finding.type === 'error' ? 'bg-rose-500' : finding.type === 'warning' ? 'bg-amber-500' : 'bg-sky-500'}`} />
                                    <div className="p-5 flex-1">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded ${finding.type === 'error' ? 'text-rose-600 bg-rose-50' : finding.type === 'warning' ? 'text-amber-600 bg-amber-50' : 'text-sky-600 bg-sky-50'}`}>{finding.category}</span>
                                            {finding.type === 'error' ? <XCircle size={16} className="text-rose-500" /> : finding.type === 'warning' ? <AlertTriangle size={16} className="text-amber-500" /> : <Info size={16} className="text-sky-500" />}
                                        </div>
                                        <h4 className="font-bold text-slate-800 mb-2">{finding.title}</h4>
                                        <p className="text-slate-600 text-sm mb-4 leading-relaxed break-words">{finding.description}</p>
                                        <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100/50 flex items-start gap-3">
                                            <Zap size={16} className="text-indigo-500 mt-0.5 flex-shrink-0" />
                                            <p className="text-sm text-slate-700 italic font-medium break-words flex-1 min-w-0">&quot;{finding.suggestion}&quot;</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Entity Forms & Views */}
            {entityBreakdown.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex items-center gap-2">
                        <Table size={16} className="text-indigo-600" />
                        <span className="font-semibold text-slate-800">Custom Forms & Views by Entity</span>
                        <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">{entityBreakdown.length} entities</span>
                    </div>
                    <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
                        {entityBreakdown.slice(0, 20).map(({ entity, forms, views }) => (
                            <div key={entity} className="p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="font-mono text-xs font-semibold text-slate-700">{entity}</span>
                                    <div className="flex gap-2">
                                        <span className="text-[10px] text-slate-500">{forms.length} forms</span>
                                        <span className="text-[10px] text-slate-500">{views.length} views</span>
                                    </div>
                                </div>
                                {forms.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mb-1">
                                        {forms.map((f: any) => {
                                            const ftConfig = FORM_TYPE_LABELS[f.formType] || { label: `Type ${f.formType}`, color: "bg-slate-50 text-slate-600" };
                                            return (
                                                <span key={f._id} className={`text-[10px] px-2 py-0.5 rounded font-medium ${ftConfig.color}`}>
                                                    {f.name} ({ftConfig.label})
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                                {views.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {views.slice(0, 8).map((v: any) => (
                                            <span key={v._id} className="text-[10px] px-2 py-0.5 rounded font-medium bg-slate-50 text-slate-500">
                                                {v.name}
                                            </span>
                                        ))}
                                        {views.length > 8 && (
                                            <span className="text-[10px] px-2 py-0.5 rounded font-medium bg-slate-100 text-slate-400">+{views.length - 8} more</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            </>}
        </div>
    );
}
