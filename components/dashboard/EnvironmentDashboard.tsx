import React, { useState } from 'react';
import {
    Activity, Shield, Code2, LayoutGrid, BarChart3, HardDrive,
    RefreshCw, Loader2, AlertTriangle, AlertCircle, Info,
    CheckCircle2, ChevronRight, Sparkles, TrendingUp, TrendingDown,
    Minus, Eye, XCircle, ArrowRight,
} from 'lucide-react';
import { useQuery, useAction, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';

interface EnvironmentDashboardProps {
    activeTenant: any;
    orgId?: string;
    onNavigate?: (tab: string) => void;
}

const CATEGORY_META: Record<string, { label: string; icon: React.ReactNode; color: string; bgColor: string; weight: string }> = {
    security: { label: 'Security', icon: <Shield size={18} />, color: 'text-violet-600', bgColor: 'bg-violet-50', weight: '25%' },
    codeQuality: { label: 'Code Quality', icon: <Code2 size={18} />, color: 'text-blue-600', bgColor: 'bg-blue-50', weight: '20%' },
    appHealth: { label: 'App Health', icon: <LayoutGrid size={18} />, color: 'text-emerald-600', bgColor: 'bg-emerald-50', weight: '20%' },
    performance: { label: 'Performance', icon: <BarChart3 size={18} />, color: 'text-amber-600', bgColor: 'bg-amber-50', weight: '20%' },
    storage: { label: 'Storage', icon: <HardDrive size={18} />, color: 'text-teal-600', bgColor: 'bg-teal-50', weight: '15%' },
};

function getScoreColor(score: number): string {
    if (score >= 80) return 'text-emerald-600';
    if (score >= 60) return 'text-amber-600';
    if (score >= 40) return 'text-orange-600';
    return 'text-rose-600';
}

function getScoreRingColor(score: number): string {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#f59e0b';
    if (score >= 40) return '#f97316';
    return '#ef4444';
}

function getScoreLabel(score: number): string {
    if (score >= 80) return 'Healthy';
    if (score >= 60) return 'Fair';
    if (score >= 40) return 'Needs Attention';
    return 'Critical';
}

function getScoreBgColor(score: number): string {
    if (score >= 80) return 'bg-emerald-50 border-emerald-200';
    if (score >= 60) return 'bg-amber-50 border-amber-200';
    if (score >= 40) return 'bg-orange-50 border-orange-200';
    return 'bg-rose-50 border-rose-200';
}

function getSeverityMeta(severity: string) {
    switch (severity) {
        case 'critical': return { icon: <XCircle size={16} />, color: 'text-rose-600', bg: 'bg-rose-50 border-rose-200', badge: 'bg-rose-100 text-rose-700' };
        case 'warning': return { icon: <AlertTriangle size={16} />, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', badge: 'bg-amber-100 text-amber-700' };
        default: return { icon: <Info size={16} />, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', badge: 'bg-blue-100 text-blue-700' };
    }
}

function HealthScoreRing({ score, size = 160 }: { score: number; size?: number }) {
    const strokeWidth = 12;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = (score / 100) * circumference;
    const color = getScoreRingColor(score);

    return (
        <div className="relative" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
                <circle
                    cx={size / 2} cy={size / 2} r={radius}
                    fill="none" stroke="#e2e8f0" strokeWidth={strokeWidth}
                />
                <circle
                    cx={size / 2} cy={size / 2} r={radius}
                    fill="none" stroke={color} strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference - progress}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-4xl font-bold ${getScoreColor(score)}`}>{score}</span>
                <span className="text-xs text-slate-400 font-medium">{getScoreLabel(score)}</span>
            </div>
        </div>
    );
}

function CategoryScoreCard({ category, score, onNavigate }: { category: string; score: number; onNavigate?: () => void }) {
    const meta = CATEGORY_META[category];
    if (!meta) return null;

    return (
        <button
            onClick={onNavigate}
            className={`${meta.bgColor} rounded-2xl p-4 border border-transparent hover:border-slate-200 transition-all text-left group`}
        >
            <div className="flex items-center justify-between mb-3">
                <div className={`${meta.color} flex items-center gap-2`}>
                    {meta.icon}
                    <span className="text-sm font-semibold">{meta.label}</span>
                </div>
                <span className="text-[10px] text-slate-400 font-medium">{meta.weight}</span>
            </div>
            <div className="flex items-end justify-between">
                <div>
                    <span className={`text-2xl font-bold ${getScoreColor(score)}`}>{score}</span>
                    <span className="text-sm text-slate-400 ml-1">/100</span>
                </div>
                <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
            </div>
            <div className="mt-2 h-1.5 bg-white/60 rounded-full overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${score}%`, backgroundColor: getScoreRingColor(score) }}
                />
            </div>
        </button>
    );
}

function IssuesSummaryBadges({ issues }: { issues: { critical: number; warning: number; info: number } }) {
    return (
        <div className="flex flex-wrap items-center justify-center gap-2">
            {issues.critical > 0 && (
                <div className="flex items-center gap-1.5 bg-rose-50 text-rose-700 px-2.5 py-1 rounded-lg border border-rose-200">
                    <XCircle size={12} />
                    <span className="text-xs font-semibold">{issues.critical}</span>
                    <span className="text-[11px]">Critical</span>
                </div>
            )}
            {issues.warning > 0 && (
                <div className="flex items-center gap-1.5 bg-amber-50 text-amber-700 px-2.5 py-1 rounded-lg border border-amber-200">
                    <AlertTriangle size={12} />
                    <span className="text-xs font-semibold">{issues.warning}</span>
                    <span className="text-[11px]">Warnings</span>
                </div>
            )}
            {issues.info > 0 && (
                <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg border border-blue-200">
                    <Info size={12} />
                    <span className="text-xs font-semibold">{issues.info}</span>
                    <span className="text-[11px]">Info</span>
                </div>
            )}
            {issues.critical === 0 && issues.warning === 0 && issues.info === 0 && (
                <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg border border-emerald-200">
                    <CheckCircle2 size={12} />
                    <span className="text-[11px] font-medium">No issues found</span>
                </div>
            )}
        </div>
    );
}

function AdvisoryCard({ advisory, onDismiss, onResolve }: {
    advisory: any;
    onDismiss: () => void;
    onResolve: () => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const severity = getSeverityMeta(advisory.severity);
    const categoryMeta = CATEGORY_META[advisory.category];

    return (
        <div className={`rounded-2xl border p-4 ${severity.bg} transition-all`}>
            <div className="flex items-start gap-3">
                <div className={`mt-0.5 ${severity.color}`}>{severity.icon}</div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${severity.badge} px-2 py-0.5 rounded-md`}>
                            {advisory.severity}
                        </span>
                        {categoryMeta && (
                            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                                {categoryMeta.label}
                            </span>
                        )}
                    </div>
                    <h4 className="font-semibold text-slate-800 text-sm">{advisory.title}</h4>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">{advisory.description}</p>

                    {expanded && (
                        <div className="mt-3 bg-white/70 rounded-xl p-3 border border-slate-200/50">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Remediation Steps</p>
                            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{advisory.remediation}</p>
                        </div>
                    )}

                    <div className="flex items-center gap-3 mt-3">
                        <button
                            onClick={() => setExpanded(!expanded)}
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition-colors flex items-center gap-1"
                        >
                            {expanded ? 'Hide Steps' : 'View Fix'}
                            <ArrowRight size={12} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
                        </button>
                        {advisory.status === 'open' && (
                            <>
                                <button
                                    onClick={onResolve}
                                    className="text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
                                >
                                    Mark Resolved
                                </button>
                                <button
                                    onClick={onDismiss}
                                    className="text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    Dismiss
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function EnvironmentStatsGrid({ summary }: { summary: any }) {
    const stats = [
        { label: 'Cloud Flows', value: summary.counts.flows, icon: <Activity size={16} />, color: 'text-indigo-600', bg: 'bg-indigo-50' },
        { label: 'Tables', value: summary.counts.tables, icon: <HardDrive size={16} />, color: 'text-slate-600', bg: 'bg-slate-100' },
        { label: 'Security Roles', value: summary.counts.securityRoles, icon: <Shield size={16} />, color: 'text-violet-600', bg: 'bg-violet-50' },
        { label: 'Teams', value: summary.counts.securityTeams, icon: <Activity size={16} />, color: 'text-purple-600', bg: 'bg-purple-50' },
        { label: 'Web Resources', value: summary.counts.webResources, icon: <Code2 size={16} />, color: 'text-blue-600', bg: 'bg-blue-50' },
        { label: 'JS Resources', value: summary.counts.jsWebResources, icon: <Code2 size={16} />, color: 'text-cyan-600', bg: 'bg-cyan-50' },
        { label: 'Apps', value: summary.counts.modelDrivenApps, icon: <LayoutGrid size={16} />, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { label: 'Forms', value: summary.counts.systemForms, icon: <LayoutGrid size={16} />, color: 'text-green-600', bg: 'bg-green-50' },
    ];

    return (
        <div className="grid grid-cols-4 gap-3">
            {stats.map((stat) => (
                <div key={stat.label} className={`${stat.bg} rounded-xl p-3 flex items-center gap-3`}>
                    <div className={stat.color}>{stat.icon}</div>
                    <div>
                        <p className="text-lg font-bold text-slate-800">{stat.value}</p>
                        <p className="text-[10px] text-slate-500 font-medium">{stat.label}</p>
                    </div>
                </div>
            ))}
        </div>
    );
}

function HealthTrend({ snapshots }: { snapshots: any[] }) {
    if (snapshots.length < 2) {
        return (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
                <TrendingUp size={24} className="text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400">Run multiple health assessments to see trends over time.</p>
            </div>
        );
    }

    const sorted = [...snapshots].sort((a, b) => a.timestamp - b.timestamp).slice(-10);
    const maxScore = 100;
    const chartHeight = 120;
    const chartWidth = 100;

    return (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                <TrendingUp size={16} className="text-indigo-500" />
                Health Score Trend
            </h3>
            <div className="flex items-end gap-2 h-32">
                {sorted.map((snapshot, i) => {
                    const height = (snapshot.overallScore / maxScore) * chartHeight;
                    const prev = i > 0 ? sorted[i - 1].overallScore : snapshot.overallScore;
                    const diff = snapshot.overallScore - prev;

                    return (
                        <div key={snapshot._id || i} className="flex-1 flex flex-col items-center gap-1">
                            <div className="flex items-center gap-0.5">
                                {diff > 0 && <TrendingUp size={10} className="text-emerald-500" />}
                                {diff < 0 && <TrendingDown size={10} className="text-rose-500" />}
                                {diff === 0 && i > 0 && <Minus size={10} className="text-slate-400" />}
                                <span className="text-[9px] font-medium text-slate-500">{snapshot.overallScore}</span>
                            </div>
                            <div
                                className="w-full rounded-t-lg transition-all duration-500"
                                style={{
                                    height: `${height}px`,
                                    backgroundColor: getScoreRingColor(snapshot.overallScore),
                                    opacity: 0.8,
                                }}
                            />
                            <span className="text-[8px] text-slate-400">
                                {new Date(snapshot.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default function EnvironmentDashboard({ activeTenant, orgId, onNavigate }: EnvironmentDashboardProps) {
    const [assessing, setAssessing] = useState(false);
    const [assessError, setAssessError] = useState<string | null>(null);
    const [advisoryFilter, setAdvisoryFilter] = useState<string>('all');

    const tenantId = activeTenant?.tenantId;

    const summary = useQuery(
        api.queries.getEnvironmentHealthSummary,
        tenantId ? { tenantId } : "skip"
    );

    const healthSnapshot = useQuery(
        api.queries.getHealthSnapshot,
        tenantId ? { tenantId } : "skip"
    );

    const healthSnapshots = useQuery(
        api.queries.getHealthSnapshots,
        tenantId ? { tenantId } : "skip"
    ) || [];

    const advisories = useQuery(
        api.queries.getAdvisories,
        tenantId ? { tenantId } : "skip"
    ) || [];

    const assessHealth = useAction(api.gemini.assessEnvironmentHealth);
    const updateAdvisoryStatus = useMutation(api.mutations.updateAdvisoryStatus);

    const handleAssess = async () => {
        if (!tenantId) return;
        setAssessing(true);
        setAssessError(null);
        try {
            await assessHealth({ tenantId, orgId });
        } catch (err) {
            setAssessError(err instanceof Error ? err.message : 'Assessment failed');
        } finally {
            setAssessing(false);
        }
    };

    const handleAdvisoryAction = async (advisoryId: string, status: string) => {
        await updateAdvisoryStatus({ advisoryId: advisoryId as Id<"advisories">, status });
    };

    const categoryScores = healthSnapshot?.categoryScores
        ? JSON.parse(healthSnapshot.categoryScores)
        : null;

    const issuesSummary = healthSnapshot?.issuesSummary
        ? JSON.parse(healthSnapshot.issuesSummary)
        : { critical: 0, warning: 0, info: 0 };

    const filteredAdvisories = advisoryFilter === 'all'
        ? advisories
        : advisories.filter((a: any) => a.status === advisoryFilter);

    const openAdvisories = advisories.filter((a: any) => a.status === 'open');
    const criticalCount = openAdvisories.filter((a: any) => a.severity === 'critical').length;
    const warningCount = openAdvisories.filter((a: any) => a.severity === 'warning').length;

    // No tenant selected
    if (!activeTenant) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center">
                    <Activity size={48} className="text-slate-300 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-slate-700 mb-2">No Tenant Selected</h2>
                    <p className="text-sm text-slate-400">Select a tenant from the sidebar to view the environment health dashboard.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Environment Health</h1>
                    <p className="text-sm text-slate-400 mt-1">
                        Aggregated health assessment for <span className="font-medium text-slate-500">{activeTenant?.name}</span>
                    </p>
                </div>
                <button
                    onClick={handleAssess}
                    disabled={assessing}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-indigo-700 transition-all text-sm disabled:opacity-50 shadow-lg shadow-indigo-200"
                >
                    {assessing ? (
                        <>
                            <Loader2 size={16} className="animate-spin" />
                            Assessing...
                        </>
                    ) : (
                        <>
                            <Sparkles size={16} />
                            Run Health Assessment
                        </>
                    )}
                </button>
            </div>

            {assessError && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-rose-700">
                    <AlertCircle size={16} />
                    {assessError}
                </div>
            )}

            {/* Health Score + Category Grid */}
            {healthSnapshot ? (
                <div className="grid grid-cols-12 gap-6">
                    {/* Score Ring */}
                    <div className="col-span-3 bg-white rounded-2xl border border-slate-200 p-6 flex flex-col items-center justify-center">
                        <HealthScoreRing score={healthSnapshot.overallScore} />
                        <div className="mt-4 text-center">
                            <IssuesSummaryBadges issues={issuesSummary} />
                        </div>
                        {healthSnapshot.timestamp && (
                            <p className="text-[10px] text-slate-400 mt-3">
                                Last assessed: {new Date(healthSnapshot.timestamp).toLocaleString()}
                            </p>
                        )}
                    </div>

                    {/* Category Scores */}
                    <div className="col-span-9">
                        <div className="grid grid-cols-3 gap-3 mb-3">
                            {categoryScores && Object.entries(categoryScores).map(([key, score]) => (
                                <CategoryScoreCard
                                    key={key}
                                    category={key}
                                    score={score as number}
                                    onNavigate={() => {
                                        const tabMap: Record<string, string> = {
                                            security: 'security-roles',
                                            codeQuality: 'webresources',
                                            appHealth: 'apps',
                                            performance: 'telemetry',
                                            storage: 'storage',
                                        };
                                        if (onNavigate && tabMap[key]) onNavigate(tabMap[key]);
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
                    <Sparkles size={32} className="text-slate-300 mx-auto mb-3" />
                    <h3 className="text-lg font-semibold text-slate-600 mb-1">No Health Assessment Yet</h3>
                    <p className="text-sm text-slate-400 mb-4 max-w-md mx-auto">
                        Run an AI-powered health assessment to get an overall score, category breakdown, and actionable advisories for this environment.
                    </p>
                    <button
                        onClick={handleAssess}
                        disabled={assessing}
                        className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-indigo-700 transition-all text-sm disabled:opacity-50"
                    >
                        {assessing ? (
                            <span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Assessing...</span>
                        ) : (
                            <span className="flex items-center gap-2"><Sparkles size={14} /> Run First Assessment</span>
                        )}
                    </button>
                </div>
            )}

            {/* Environment Stats */}
            {summary && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                    <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                        <Eye size={16} className="text-indigo-500" />
                        Environment Overview
                    </h3>
                    <EnvironmentStatsGrid summary={summary} />

                    <div className="grid grid-cols-2 gap-4 mt-4">
                        <div className="bg-slate-50 rounded-xl p-3">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Connections</p>
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                    {summary.connections.appInsights
                                        ? <CheckCircle2 size={14} className="text-emerald-500" />
                                        : <XCircle size={14} className="text-slate-300" />
                                    }
                                    <span className="text-xs text-slate-600">Application Insights</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {summary.connections.ppAdmin
                                        ? <CheckCircle2 size={14} className="text-emerald-500" />
                                        : <XCircle size={14} className="text-slate-300" />
                                    }
                                    <span className="text-xs text-slate-600">Power Platform Admin</span>
                                </div>
                            </div>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-3">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Security Breakdown</p>
                            <div className="grid grid-cols-2 gap-1">
                                <span className="text-xs text-slate-500">Custom Roles: <strong className="text-slate-700">{summary.securityDetails.customRoles}</strong></span>
                                <span className="text-xs text-slate-500">Managed Roles: <strong className="text-slate-700">{summary.securityDetails.managedRoles}</strong></span>
                                <span className="text-xs text-slate-500">Owner Teams: <strong className="text-slate-700">{summary.securityDetails.ownerTeams}</strong></span>
                                <span className="text-xs text-slate-500">AAD Teams: <strong className="text-slate-700">{summary.securityDetails.aadTeams}</strong></span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Health Trend */}
            <HealthTrend snapshots={healthSnapshots} />

            {/* Advisories */}
            {advisories.length > 0 && (
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                            <AlertTriangle size={16} className="text-amber-500" />
                            Advisories
                            {criticalCount > 0 && (
                                <span className="bg-rose-100 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-md">{criticalCount} critical</span>
                            )}
                            {warningCount > 0 && (
                                <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-md">{warningCount} warnings</span>
                            )}
                        </h3>
                        <div className="flex items-center gap-1.5 bg-slate-100 rounded-xl p-1">
                            {['all', 'open', 'resolved', 'dismissed'].map((filter) => (
                                <button
                                    key={filter}
                                    onClick={() => setAdvisoryFilter(filter)}
                                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                                        advisoryFilter === filter
                                            ? 'bg-white text-slate-700 shadow-sm'
                                            : 'text-slate-400 hover:text-slate-600'
                                    }`}
                                >
                                    {filter.charAt(0).toUpperCase() + filter.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-3">
                        {filteredAdvisories.map((advisory: any) => (
                            <AdvisoryCard
                                key={advisory._id}
                                advisory={advisory}
                                onDismiss={() => handleAdvisoryAction(advisory._id, 'dismissed')}
                                onResolve={() => handleAdvisoryAction(advisory._id, 'resolved')}
                            />
                        ))}
                        {filteredAdvisories.length === 0 && (
                            <div className="text-center py-8 text-sm text-slate-400">
                                No {advisoryFilter !== 'all' ? advisoryFilter : ''} advisories found.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
