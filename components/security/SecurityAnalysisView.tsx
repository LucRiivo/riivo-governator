import { useAction, useQuery } from "convex/react";
import React, { useState, useMemo, useEffect } from 'react';
import { api } from "@/convex/_generated/api";
import {
    Building2,
    Shield,
    Users,
    Zap,
    RefreshCw,
    CheckCircle,
    AlertTriangle,
    Info,
    XCircle,
    Crown,
    Ban,
    ChevronRight,
    KeyRound,
    UserCheck,
    Globe,
    ShieldAlert,
    BarChart3,
    Mail,
    User,
    Download,
} from 'lucide-react';
import { Tenant } from '../Sidebar';
import EntityDocumentationEditor from '../EntityDocumentationEditor';

interface SecurityAnalysisViewProps {
    selectedItem: any;
    selectedTab: string;
    activeTenant: Tenant | null;
    orgId?: string;
    businessUnits?: any[];
    securityRoles?: any[];
    securityTeams?: any[];
}

function ScoreRing({ score, size = 80, label }: { score: number; size?: number; label?: string }) {
    const radius = (size - 8) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;

    const getColor = (s: number) => {
        if (s >= 90) return { stroke: "#10b981", text: "text-emerald-500", bg: "bg-emerald-50" };
        if (s >= 70) return { stroke: "#3b82f6", text: "text-blue-500", bg: "bg-blue-50" };
        if (s >= 50) return { stroke: "#f59e0b", text: "text-amber-500", bg: "bg-amber-50" };
        return { stroke: "#ef4444", text: "text-rose-500", bg: "bg-rose-50" };
    };

    const color = getColor(score);

    return (
        <div className="flex flex-col items-center gap-1">
            <div className="relative" style={{ width: size, height: size }}>
                <svg width={size} height={size} className="-rotate-90">
                    <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e2e8f0" strokeWidth="6" />
                    <circle
                        cx={size / 2} cy={size / 2} r={radius} fill="none"
                        stroke={color.stroke} strokeWidth="6"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                        className="transition-all duration-1000 ease-out"
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`text-lg font-bold ${color.text}`}>{score}</span>
                </div>
            </div>
            {label && <span className="text-[10px] font-medium text-slate-500 text-center">{label}</span>}
        </div>
    );
}

function FindingIcon({ type }: { type: string }) {
    switch (type) {
        case 'error': return <XCircle size={16} className="text-rose-500" />;
        case 'warning': return <AlertTriangle size={16} className="text-amber-500" />;
        case 'info': return <Info size={16} className="text-sky-500" />;
        default: return <CheckCircle size={16} className="text-emerald-500" />;
    }
}

export default function SecurityAnalysisView({
    selectedItem,
    selectedTab,
    activeTenant,
    orgId,
    businessUnits = [],
    securityRoles = [],
    securityTeams = [],
}: SecurityAnalysisViewProps) {
    const analyzeSecurityOverview = useAction(api.actions.securityAudit.analyzeSecurityOverview);
    const getTeamMembers = useAction(api.actions.security.getTeamMembers);

    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<any>(null);
    const [teamMembers, setTeamMembers] = useState<any[] | null>(null);
    const [isLoadingMembers, setIsLoadingMembers] = useState(false);
    const [membersError, setMembersError] = useState<string | null>(null);
    const [overviewTab, setOverviewTab] = useState<'audit' | 'docs'>('audit');

    useEffect(() => {
        setTeamMembers(null);
        setMembersError(null);
    }, [selectedItem?.teamId]);

    // Fetch cached audit
    const cachedAudit = useQuery(
        api.queries.getSecurityAuditResult,
        activeTenant?.tenantId ? { tenantId: activeTenant.tenantId } : "skip"
    );

    const displayResult = useMemo(() => {
        if (analysisResult) return analysisResult;
        if (cachedAudit?.result) {
            try { return JSON.parse(cachedAudit.result); }
            catch { return null; }
        }
        return null;
    }, [analysisResult, cachedAudit]);

    const handleRunAudit = async () => {
        if (!activeTenant?.tenantId) return;
        setIsAnalyzing(true);
        setAnalysisResult(null);
        try {
            const result = await analyzeSecurityOverview({
                tenantId: activeTenant.tenantId,
                orgId,
                forceRefresh: true,
            });
            setAnalysisResult(result);
        } catch (error) {
            console.error("Security audit failed:", error);
            setAnalysisResult({
                summary: "Security audit failed. See console for details.",
                overallScore: 0,
                categories: {},
                findings: [{
                    type: "error",
                    category: "System",
                    title: "Audit Error",
                    description: error instanceof Error ? error.message : "Unknown error",
                    suggestion: "Ensure security data is synced and Claude API key is configured."
                }],
                stats: {}
            });
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleFetchMembers = async () => {
        if (!activeTenant?.tenantId || !selectedItem?.teamId) return;
        setIsLoadingMembers(true);
        setMembersError(null);
        try {
            const members = await getTeamMembers({
                tenantId: activeTenant.tenantId,
                teamId: selectedItem.teamId,
                orgId,
            });
            setTeamMembers(members);
        } catch (error) {
            console.error("Failed to fetch team members:", error);
            setMembersError(error instanceof Error ? error.message : "Failed to fetch team members");
        } finally {
            setIsLoadingMembers(false);
        }
    };

    // BU detail
    const getBUChildren = (buId: string) => businessUnits.filter(bu => bu.parentBusinessUnitId === buId);
    const getBURoles = (buId: string) => securityRoles.filter(r => r.businessUnitId === buId);
    const getBUTeams = (buId: string) => securityTeams.filter(t => t.businessUnitId === buId);

    // Team type label
    const getTeamTypeLabel = (type: number) => {
        switch (type) {
            case 0: return "Owner Team";
            case 2: return "AAD Security Group";
            case 3: return "AAD Office Group";
            default: return `Type ${type}`;
        }
    };

    // No item selected -- show overview/audit view
    if (!selectedItem) {
        const hasData = businessUnits.length > 0 || securityRoles.length > 0 || securityTeams.length > 0;

        return (
            <div className="space-y-6 max-w-5xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600">
                            <ShieldAlert size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-slate-800">Security Overview</h3>
                            <p className="text-sm text-slate-500 flex items-center gap-2">
                                <Globe size={12} /> {activeTenant?.url || 'No connection'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex bg-slate-100 p-1 rounded-xl">
                            <button
                                onClick={() => setOverviewTab('audit')}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${overviewTab === 'audit'
                                    ? 'bg-white text-slate-800 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                Audit
                            </button>
                            <button
                                onClick={() => setOverviewTab('docs')}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${overviewTab === 'docs'
                                    ? 'bg-white text-slate-800 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                Documentation
                            </button>
                        </div>
                        {overviewTab === 'audit' && (
                            <button
                                onClick={handleRunAudit}
                                disabled={isAnalyzing || !hasData}
                                className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
                            >
                                {isAnalyzing ? <RefreshCw className="animate-spin" size={18} /> : <Zap size={18} fill="currentColor" />}
                                {isAnalyzing ? 'Analyzing...' : (displayResult ? 'Re-run Audit' : 'Run Security Audit')}
                            </button>
                        )}
                    </div>
                </div>

                {overviewTab === 'docs' && activeTenant?.tenantId && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <EntityDocumentationEditor
                            docType="security"
                            tenantId={activeTenant.tenantId}
                        />
                    </div>
                )}

                {overviewTab === 'audit' && !hasData && (
                    <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                        <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Shield size={32} className="text-slate-300" />
                        </div>
                        <p className="font-semibold text-slate-500 mb-1">No Security Data Synced</p>
                        <p className="text-sm text-slate-400">Use the left panel to sync Business Units, Security Roles, and Teams from your D365 environment.</p>
                    </div>
                )}

                {/* Quick Stats */}
                {overviewTab === 'audit' && hasData && !displayResult && (
                    <div className="grid grid-cols-4 gap-4">
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                                <Building2 size={16} className="text-indigo-500" />
                                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Business Units</span>
                            </div>
                            <p className="text-2xl font-bold text-slate-800">{businessUnits.length}</p>
                            <p className="text-[11px] text-slate-400 mt-1">{businessUnits.filter(b => b.isDisabled).length} disabled</p>
                        </div>
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                                <Shield size={16} className="text-indigo-500" />
                                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Security Roles</span>
                            </div>
                            <p className="text-2xl font-bold text-slate-800">{securityRoles.length}</p>
                            <p className="text-[11px] text-slate-400 mt-1">{securityRoles.filter(r => !r.isManaged).length} custom</p>
                        </div>
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                                <Users size={16} className="text-indigo-500" />
                                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Teams</span>
                            </div>
                            <p className="text-2xl font-bold text-slate-800">{securityTeams.length}</p>
                            <p className="text-[11px] text-slate-400 mt-1">{securityTeams.filter(t => t.roles.length === 0).length} with no roles</p>
                        </div>
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                                <BarChart3 size={16} className="text-indigo-500" />
                                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">AAD Teams</span>
                            </div>
                            <p className="text-2xl font-bold text-slate-800">{securityTeams.filter(t => t.teamType === 2 || t.teamType === 3).length}</p>
                            <p className="text-[11px] text-slate-400 mt-1">of {securityTeams.length} total</p>
                        </div>
                    </div>
                )}

                {/* Audit Results */}
                {overviewTab === 'audit' && displayResult && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* Overall Score */}
                        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                            <div className="flex items-center gap-8">
                                <ScoreRing score={displayResult.overallScore || 0} size={100} label="Overall" />
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <CheckCircle size={18} className="text-emerald-400" />
                                        <span className="font-semibold text-slate-800">{displayResult.summary}</span>
                                    </div>
                                    {displayResult.stats && (
                                        <div className="grid grid-cols-4 gap-4 mt-4">
                                            <div className="text-center">
                                                <p className="text-lg font-bold text-slate-700">{displayResult.stats.totalBusinessUnits || 0}</p>
                                                <p className="text-[10px] text-slate-400">Business Units</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-lg font-bold text-slate-700">{displayResult.stats.totalRoles || 0}</p>
                                                <p className="text-[10px] text-slate-400">Roles ({displayResult.stats.customRoles || 0} custom)</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-lg font-bold text-slate-700">{displayResult.stats.totalTeams || 0}</p>
                                                <p className="text-[10px] text-slate-400">Teams</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-lg font-bold text-slate-700">{displayResult.stats.teamsWithNoRoles || 0}</p>
                                                <p className="text-[10px] text-slate-400">Teams w/o Roles</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                {/* Category Scores */}
                                {displayResult.categories && (
                                    <div className="flex gap-4">
                                        {Object.entries(displayResult.categories).map(([key, cat]: [string, any]) => (
                                            <ScoreRing key={key} score={cat.score || 0} size={64} label={cat.label || key} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Findings */}
                        {displayResult.findings && displayResult.findings.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {displayResult.findings.map((finding: any, idx: number) => (
                                    <div key={idx} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
                                        <div className={`h-1.5 w-full ${finding.type === 'error' ? 'bg-rose-500' :
                                            finding.type === 'warning' ? 'bg-amber-500' : 'bg-sky-500'
                                            }`} />
                                        <div className="p-5 flex-1">
                                            <div className="flex items-center justify-between mb-3">
                                                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded ${finding.type === 'error' ? 'text-rose-600 bg-rose-50' :
                                                    finding.type === 'warning' ? 'text-amber-600 bg-amber-50' : 'text-sky-600 bg-sky-50'
                                                    }`}>
                                                    {finding.category}
                                                </span>
                                                <FindingIcon type={finding.type} />
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

    // Item selected -- show detail view
    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            {/* Detail Header */}
            <div className="flex items-center justify-between bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600">
                        {selectedTab === 'security-bu' && <Building2 size={24} />}
                        {selectedTab === 'security-roles' && <Shield size={24} />}
                        {selectedTab === 'security-teams' && <Users size={24} />}
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-slate-800">{selectedItem.name}</h3>
                        <p className="text-sm text-slate-500 flex items-center gap-2">
                            <Globe size={12} /> {activeTenant?.url || 'No connection'}
                            {selectedItem.roleId && (
                                <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-mono ml-2">{selectedItem.roleId}</span>
                            )}
                            {selectedItem.teamId && (
                                <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-mono ml-2">{selectedItem.teamId}</span>
                            )}
                            {selectedItem.businessUnitId && selectedTab === 'security-bu' && (
                                <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-mono ml-2">{selectedItem.businessUnitId}</span>
                            )}
                        </p>
                    </div>
                </div>
            </div>

            {/* Business Unit Detail */}
            {selectedTab === 'security-bu' && (
                <div className="space-y-4">
                    {/* BU Properties */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                        <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <Building2 size={16} className="text-indigo-500" />
                            Properties
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-[10px] uppercase text-slate-400 font-semibold tracking-wider mb-1">Status</p>
                                <span className={`text-sm font-medium px-2 py-1 rounded ${selectedItem.isDisabled
                                    ? 'bg-rose-50 text-rose-600'
                                    : 'bg-emerald-50 text-emerald-600'
                                    }`}>
                                    {selectedItem.isDisabled ? 'Disabled' : 'Active'}
                                </span>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase text-slate-400 font-semibold tracking-wider mb-1">Hierarchy Level</p>
                                <span className="text-sm font-medium text-slate-700">
                                    {!selectedItem.parentBusinessUnitId ? 'Root (Top-Level)' : 'Child BU'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Roles in this BU */}
                    {(() => {
                        const buRoles = getBURoles(selectedItem.businessUnitId);
                        return buRoles.length > 0 ? (
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="p-4 border-b border-slate-100 flex items-center gap-2">
                                    <Shield size={16} className="text-indigo-600" />
                                    <span className="font-semibold text-slate-800">Security Roles</span>
                                    <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">{buRoles.length}</span>
                                </div>
                                <div className="divide-y divide-slate-50 max-h-60 overflow-y-auto">
                                    {buRoles.map((role: any) => (
                                        <div key={role._id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50">
                                            <div className="flex items-center gap-2">
                                                <KeyRound size={14} className="text-slate-400" />
                                                <span className="text-sm font-medium text-slate-700">{role.name}</span>
                                            </div>
                                            {role.isManaged ? (
                                                <span className="text-[10px] font-bold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-100">Managed</span>
                                            ) : (
                                                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">Custom</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null;
                    })()}

                    {/* Teams in this BU */}
                    {(() => {
                        const buTeams = getBUTeams(selectedItem.businessUnitId);
                        return buTeams.length > 0 ? (
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="p-4 border-b border-slate-100 flex items-center gap-2">
                                    <Users size={16} className="text-indigo-600" />
                                    <span className="font-semibold text-slate-800">Teams</span>
                                    <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">{buTeams.length}</span>
                                </div>
                                <div className="divide-y divide-slate-50 max-h-60 overflow-y-auto">
                                    {buTeams.map((team: any) => (
                                        <div key={team._id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50">
                                            <div className="flex items-center gap-2">
                                                <UserCheck size={14} className="text-slate-400" />
                                                <span className="text-sm font-medium text-slate-700">{team.name}</span>
                                            </div>
                                            <span className="text-[10px] text-slate-500">{team.roles.length} roles</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null;
                    })()}

                    {/* Child BUs */}
                    {(() => {
                        const children = getBUChildren(selectedItem.businessUnitId);
                        return children.length > 0 ? (
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="p-4 border-b border-slate-100 flex items-center gap-2">
                                    <ChevronRight size={16} className="text-indigo-600" />
                                    <span className="font-semibold text-slate-800">Child Business Units</span>
                                    <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">{children.length}</span>
                                </div>
                                <div className="divide-y divide-slate-50 max-h-60 overflow-y-auto">
                                    {children.map((child: any) => (
                                        <div key={child._id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50">
                                            <div className="flex items-center gap-2">
                                                <Building2 size={14} className="text-slate-400" />
                                                <span className="text-sm font-medium text-slate-700">{child.name}</span>
                                            </div>
                                            {child.isDisabled && <Ban size={12} className="text-rose-400" />}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null;
                    })()}
                </div>
            )}

            {/* Security Role Detail */}
            {selectedTab === 'security-roles' && (
                <div className="space-y-4">
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                        <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <Shield size={16} className="text-indigo-500" />
                            Role Properties
                        </h4>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <p className="text-[10px] uppercase text-slate-400 font-semibold tracking-wider mb-1">Type</p>
                                {selectedItem.isManaged ? (
                                    <span className="text-sm font-medium px-2 py-1 rounded bg-sky-50 text-sky-600">Managed (System)</span>
                                ) : (
                                    <span className="text-sm font-medium px-2 py-1 rounded bg-amber-50 text-amber-600">Custom</span>
                                )}
                            </div>
                            <div>
                                <p className="text-[10px] uppercase text-slate-400 font-semibold tracking-wider mb-1">Customizable</p>
                                <span className={`text-sm font-medium px-2 py-1 rounded ${selectedItem.isCustomizable !== false
                                    ? 'bg-emerald-50 text-emerald-600'
                                    : 'bg-slate-100 text-slate-500'
                                    }`}>
                                    {selectedItem.isCustomizable !== false ? 'Yes' : 'Locked'}
                                </span>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase text-slate-400 font-semibold tracking-wider mb-1">Business Unit</p>
                                <span className="text-sm font-medium text-slate-700">
                                    {businessUnits.find(bu => bu.businessUnitId === selectedItem.businessUnitId)?.name || selectedItem.businessUnitId || 'N/A'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Teams using this role */}
                    {(() => {
                        const teamsUsingRole = securityTeams.filter(t =>
                            t.roles.some((r: any) => r.roleId === selectedItem.roleId)
                        );
                        return teamsUsingRole.length > 0 ? (
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="p-4 border-b border-slate-100 flex items-center gap-2">
                                    <Users size={16} className="text-indigo-600" />
                                    <span className="font-semibold text-slate-800">Assigned to Teams</span>
                                    <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">{teamsUsingRole.length}</span>
                                </div>
                                <div className="divide-y divide-slate-50 max-h-60 overflow-y-auto">
                                    {teamsUsingRole.map((team: any) => (
                                        <div key={team._id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50">
                                            <div className="flex items-center gap-2">
                                                <UserCheck size={14} className="text-slate-400" />
                                                <span className="text-sm font-medium text-slate-700">{team.name}</span>
                                            </div>
                                            <span className="text-[10px] text-slate-500">{getTeamTypeLabel(team.teamType)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="bg-amber-50 rounded-2xl border border-amber-200 p-5 flex items-start gap-3">
                                <AlertTriangle size={18} className="text-amber-500 mt-0.5" />
                                <div>
                                    <p className="font-semibold text-amber-800 text-sm">No Team Assignments Found</p>
                                    <p className="text-sm text-amber-600 mt-1">
                                        This security role is not assigned to any team. Best practice is to assign roles to teams rather than directly to users.
                                    </p>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* Team Detail */}
            {selectedTab === 'security-teams' && (
                <div className="space-y-4">
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                        <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <Users size={16} className="text-indigo-500" />
                            Team Properties
                        </h4>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <p className="text-[10px] uppercase text-slate-400 font-semibold tracking-wider mb-1">Team Type</p>
                                <span className="text-sm font-medium text-slate-700">{getTeamTypeLabel(selectedItem.teamType)}</span>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase text-slate-400 font-semibold tracking-wider mb-1">Default Team</p>
                                <span className={`text-sm font-medium px-2 py-1 rounded ${selectedItem.isDefault
                                    ? 'bg-indigo-50 text-indigo-600'
                                    : 'bg-slate-100 text-slate-500'
                                    }`}>
                                    {selectedItem.isDefault ? 'Yes' : 'No'}
                                </span>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase text-slate-400 font-semibold tracking-wider mb-1">Business Unit</p>
                                <span className="text-sm font-medium text-slate-700">
                                    {businessUnits.find(bu => bu.businessUnitId === selectedItem.businessUnitId)?.name || selectedItem.businessUnitId || 'N/A'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Roles assigned to team */}
                    {selectedItem.roles && selectedItem.roles.length > 0 ? (
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="p-4 border-b border-slate-100 flex items-center gap-2">
                                <Shield size={16} className="text-indigo-600" />
                                <span className="font-semibold text-slate-800">Assigned Security Roles</span>
                                <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">{selectedItem.roles.length}</span>
                            </div>
                            <div className="divide-y divide-slate-50 max-h-60 overflow-y-auto">
                                {selectedItem.roles.map((role: any, idx: number) => (
                                    <div key={idx} className="px-4 py-3 flex items-center gap-2 hover:bg-slate-50">
                                        <KeyRound size={14} className="text-slate-400" />
                                        <span className="text-sm font-medium text-slate-700">{role.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="bg-amber-50 rounded-2xl border border-amber-200 p-5 flex items-start gap-3">
                            <AlertTriangle size={18} className="text-amber-500 mt-0.5" />
                            <div>
                                <p className="font-semibold text-amber-800 text-sm">No Roles Assigned</p>
                                <p className="text-sm text-amber-600 mt-1">
                                    This team has no security roles assigned. Members of this team will only have their personally assigned roles.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Team Members */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Users size={16} className="text-indigo-600" />
                                    <span className="font-semibold text-slate-800">Team Members</span>
                                    {teamMembers && (
                                        <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">{teamMembers.length}</span>
                                    )}
                                </div>
                                <button
                                    onClick={handleFetchMembers}
                                    disabled={isLoadingMembers}
                                    className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg border border-indigo-100 hover:bg-indigo-100 transition-colors font-medium flex items-center gap-1.5 disabled:opacity-50"
                                >
                                    {isLoadingMembers ? (
                                        <RefreshCw size={12} className="animate-spin" />
                                    ) : (
                                        <Download size={12} />
                                    )}
                                    {isLoadingMembers ? 'Loading...' : (teamMembers ? 'Refresh' : 'Load Members')}
                                </button>
                            </div>

                            {membersError && (
                                <div className="px-4 py-3 bg-rose-50 border-b border-rose-100 flex items-center gap-2">
                                    <XCircle size={14} className="text-rose-500" />
                                    <span className="text-xs text-rose-600 font-medium">{membersError}</span>
                                </div>
                            )}

                            {!teamMembers && !isLoadingMembers && !membersError && (
                                <div className="p-8 text-center">
                                    <div className="bg-slate-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                                        <Users size={20} className="text-slate-300" />
                                    </div>
                                    <p className="text-xs text-slate-400">Click <span className="font-semibold">Load Members</span> to fetch users in this team from Dynamics 365.</p>
                                </div>
                            )}

                            {isLoadingMembers && !teamMembers && (
                                <div className="p-8 text-center">
                                    <RefreshCw size={20} className="text-indigo-400 animate-spin mx-auto mb-3" />
                                    <p className="text-xs text-slate-400">Fetching team members...</p>
                                </div>
                            )}

                            {teamMembers && teamMembers.length === 0 && (
                                <div className="p-8 text-center">
                                    <div className="bg-amber-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                                        <Users size={20} className="text-amber-300" />
                                    </div>
                                    <p className="text-xs text-slate-500 font-medium">No members in this team</p>
                                </div>
                            )}

                            {teamMembers && teamMembers.length > 0 && (
                                <div className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
                                    {teamMembers.map((member: any) => (
                                        <div key={member.systemUserId} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${member.isDisabled ? 'bg-slate-100 text-slate-400' : 'bg-indigo-50 text-indigo-600'}`}>
                                                    {member.fullName.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className={`text-sm font-medium ${member.isDisabled ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                                                        {member.fullName}
                                                    </p>
                                                    {member.email && (
                                                        <p className="text-[11px] text-slate-400 flex items-center gap-1">
                                                            <Mail size={10} />
                                                            {member.email}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            {member.isDisabled && (
                                                <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">Disabled</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                </div>
            )}
        </div>
    );
}
