import { useAction, useQuery } from "convex/react";
import React, { useState, useEffect, useMemo } from 'react';
import { api } from "@/convex/_generated/api";
import {
    Code2,
    Zap,
    RefreshCw,
    CheckCircle,
    AlertTriangle,
    Info,
    XCircle,
    Globe,
    FileCode,
    Copy,
    Check,
    Box,
} from 'lucide-react';
import { Tenant } from '../Sidebar';
import EntityDocumentationEditor from '../EntityDocumentationEditor';

interface WebResourceDetailViewProps {
    selectedItem: any;
    activeTenant: Tenant | null;
    orgId?: string;
}

const WEB_RESOURCE_TYPE_LABELS: Record<number, string> = {
    1: "HTML", 2: "CSS", 3: "JavaScript", 4: "XML", 5: "PNG",
    6: "JPG", 7: "GIF", 8: "Silverlight", 9: "XSL", 10: "ICO", 11: "SVG", 12: "RESX"
};

const TEXT_TYPES = [1, 2, 3, 4, 9, 11, 12];
const AUDITABLE_TYPES = [1, 2, 3]; // HTML, CSS, JS

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

export default function WebResourceDetailView({
    selectedItem,
    activeTenant,
    orgId,
}: WebResourceDetailViewProps) {
    const getWebResourceContent = useAction(api.actions.webresources.getWebResourceContent);
    const analyzeWebResource = useAction(api.actions.webResourceAudit.analyzeWebResource);

    const [content, setContent] = useState<any>(null);
    const [loadingContent, setLoadingContent] = useState(false);
    const [isAuditing, setIsAuditing] = useState(false);
    const [auditResult, setAuditResult] = useState<any>(null);
    const [copied, setCopied] = useState(false);
    const [selectedSubTab, setSelectedSubTab] = useState<'code' | 'audit' | 'docs'>('code');

    // Cached audit result
    const cachedAudit = useQuery(
        api.queries.getWebResourceAuditResult,
        selectedItem?._id ? { webResourceId: selectedItem._id } : "skip"
    );

    const displayAudit = useMemo(() => {
        if (auditResult) return auditResult;
        if (cachedAudit?.result) {
            try { return JSON.parse(cachedAudit.result); }
            catch { return null; }
        }
        return null;
    }, [auditResult, cachedAudit]);

    // Fetch content when item changes
    useEffect(() => {
        if (selectedItem && activeTenant?.tenantId && selectedItem.webResourceId) {
            setLoadingContent(true);
            setContent(null);
            setAuditResult(null);
            getWebResourceContent({
                tenantId: activeTenant.tenantId,
                webResourceId: selectedItem.webResourceId,
                orgId
            })
                .then((data: any) => setContent(data))
                .catch(err => {
                    console.error("Failed to fetch web resource content:", err);
                    setContent(null);
                })
                .finally(() => setLoadingContent(false));
        } else {
            setContent(null);
        }
    }, [selectedItem, activeTenant, getWebResourceContent, orgId]);

    const handleCopy = async () => {
        if (content?.decodedContent) {
            await navigator.clipboard.writeText(content.decodedContent);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleAudit = async () => {
        if (!selectedItem || !activeTenant?.tenantId || !content?.decodedContent) return;
        setIsAuditing(true);
        setAuditResult(null);
        try {
            const result = await analyzeWebResource({
                webResourceConvexId: selectedItem._id,
                tenantId: activeTenant.tenantId,
                code: content.decodedContent,
                resourceName: selectedItem.name,
                resourceType: content.typeLabel || "JScript",
                forceRefresh: true,
            });
            setAuditResult(result);
            setSelectedSubTab('audit');
        } catch (error) {
            console.error("Web resource audit failed:", error);
            setAuditResult({
                summary: "Audit failed. See console for details.",
                overallScore: 0,
                findings: [{
                    type: "error",
                    category: "System",
                    title: "Audit Error",
                    description: error instanceof Error ? error.message : "Unknown error",
                    suggestion: "Ensure the Claude API key is configured."
                }],
                stats: { totalIssues: 1 }
            });
            setSelectedSubTab('audit');
        } finally {
            setIsAuditing(false);
        }
    };

    // No item selected
    if (!selectedItem) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
                <div className="bg-white p-8 rounded-full shadow-sm border border-slate-100">
                    <Box size={64} className="text-slate-200" />
                </div>
                <div className="text-center">
                    <p className="font-semibold text-slate-500">No Web Resource Selected</p>
                    <p className="text-sm">Pick a web resource from the list to view its code and run an audit.</p>
                </div>
            </div>
        );
    }

    const typeLabel = WEB_RESOURCE_TYPE_LABELS[selectedItem.webResourceType] || `Type ${selectedItem.webResourceType}`;
    const isTextBased = TEXT_TYPES.includes(selectedItem.webResourceType);
    const isAuditable = AUDITABLE_TYPES.includes(selectedItem.webResourceType);

    const getLanguageHint = (type: number) => {
        switch (type) {
            case 1: return "html";
            case 2: return "css";
            case 3: return "javascript";
            case 4: case 9: return "xml";
            case 11: return "svg";
            default: return "text";
        }
    };

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            {/* Header */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                <div className="flex items-center gap-4 min-w-0">
                    <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600 shrink-0">
                        <FileCode size={24} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="text-xl font-bold text-slate-800 truncate">
                            {selectedItem.displayName || selectedItem.name.split('/').pop() || selectedItem.name}
                        </h3>
                        <div className="flex items-center gap-2 flex-wrap text-sm text-slate-500 mt-0.5">
                            <span className="flex items-center gap-1 truncate"><Globe size={12} /> {activeTenant?.url || 'No connection'}</span>
                            <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-mono">{typeLabel}</span>
                            {selectedItem.isManaged ? (
                                <span className="text-[10px] bg-sky-50 text-sky-600 px-1.5 py-0.5 rounded border border-sky-100 font-bold">Managed</span>
                            ) : (
                                <span className="text-[10px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-100 font-bold">Unmanaged</span>
                            )}
                        </div>
                    </div>
                </div>

                {isTextBased && (
                    <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
                        <div className="flex bg-slate-100 p-1 rounded-xl">
                            <button
                                onClick={() => setSelectedSubTab('code')}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedSubTab === 'code'
                                    ? 'bg-white text-slate-800 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                Code
                            </button>
                            {isAuditable && (
                                <button
                                    onClick={() => setSelectedSubTab('audit')}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedSubTab === 'audit'
                                        ? 'bg-white text-slate-800 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                >
                                    Audit
                                </button>
                            )}
                            {isAuditable && (
                                <button
                                    onClick={() => setSelectedSubTab('docs')}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedSubTab === 'docs'
                                        ? 'bg-white text-slate-800 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                >
                                    Documentation
                                </button>
                            )}
                        </div>

                        {isAuditable && (
                            <button
                                onClick={handleAudit}
                                disabled={isAuditing || !content?.decodedContent}
                                className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-600/20 active:scale-95 shrink-0 text-sm"
                            >
                                {isAuditing ? <RefreshCw className="animate-spin" size={16} /> : <Zap size={16} fill="currentColor" />}
                                {isAuditing ? 'Auditing...' : (displayAudit ? 'Re-audit' : 'Audit Code')}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Resource Info Bar */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm min-w-0">
                    <p className="text-[10px] uppercase text-slate-400 font-semibold tracking-wider mb-1">Full Name</p>
                    <p className="text-sm font-mono text-slate-700 truncate">{selectedItem.name}</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <p className="text-[10px] uppercase text-slate-400 font-semibold tracking-wider mb-1">Type</p>
                    <p className="text-sm font-medium text-slate-700">{typeLabel}</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <p className="text-[10px] uppercase text-slate-400 font-semibold tracking-wider mb-1">Size</p>
                    <p className="text-sm font-medium text-slate-700">
                        {content?.sizeBytes
                            ? content.sizeBytes > 1024 ? `${(content.sizeBytes / 1024).toFixed(1)} KB` : `${content.sizeBytes} B`
                            : loadingContent ? '...' : 'N/A'}
                    </p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <p className="text-[10px] uppercase text-slate-400 font-semibold tracking-wider mb-1">Modified</p>
                    <p className="text-sm font-medium text-slate-700">
                        {selectedItem.modifiedOn ? new Date(selectedItem.modifiedOn).toLocaleDateString() : 'N/A'}
                    </p>
                </div>
            </div>

            {/* Code View */}
            {selectedSubTab === 'code' && (
                <div className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
                    <div className="bg-slate-800/80 px-5 py-3 flex items-center justify-between border-b border-slate-700/50">
                        <div className="flex items-center gap-2 text-slate-300 text-xs font-mono">
                            <Code2 size={14} className="text-indigo-400" />
                            {selectedItem.name}
                            {loadingContent && <span className="text-xs text-slate-500 ml-2 animate-pulse">Fetching from Dynamics 365...</span>}
                        </div>
                        <div className="flex items-center gap-2">
                            {content?.decodedContent && (
                                <>
                                    <span className="text-[10px] text-slate-500 font-mono">
                                        {content.decodedContent.split('\n').length} lines
                                    </span>
                                    <button
                                        onClick={handleCopy}
                                        className="text-slate-400 hover:text-white transition-colors p-1 rounded hover:bg-slate-700"
                                    >
                                        {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                                    </button>
                                </>
                            )}
                            <div className="flex gap-1 ml-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-slate-600" />
                                <div className="w-2.5 h-2.5 rounded-full bg-slate-600" />
                                <div className="w-2.5 h-2.5 rounded-full bg-slate-600" />
                            </div>
                        </div>
                    </div>
                    <div className="p-6 font-mono text-sm overflow-auto text-emerald-400/90 whitespace-pre leading-relaxed max-h-[600px] scrollbar-thin scrollbar-thumb-slate-700">
                        {loadingContent ? "// Fetching from Dynamics 365..." :
                            content?.decodedContent ? content.decodedContent :
                                content && !content.isTextBased ? "// Binary content - cannot display" :
                                    "// Failed to load content"}
                    </div>
                </div>
            )}

            {/* Documentation */}
            {selectedSubTab === 'docs' && activeTenant?.tenantId && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <EntityDocumentationEditor
                        docType="webresource"
                        tenantId={activeTenant.tenantId}
                        webResourceId={selectedItem._id}
                        webResourceName={selectedItem.displayName || selectedItem.name}
                        webResourceType={WEB_RESOURCE_TYPE_LABELS[selectedItem.webResourceType] || 'JavaScript'}
                        webResourceCode={content?.decodedContent}
                    />
                </div>
            )}

            {/* Audit Results */}
            {selectedSubTab === 'audit' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {displayAudit ? (
                        <>
                            {/* Score Header */}
                            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                                <div className="flex items-center gap-8">
                                    <ScoreRing score={displayAudit.overallScore || 0} size={100} label="Code Quality" />
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <CheckCircle size={18} className="text-emerald-400" />
                                            <span className="font-semibold text-slate-800">{displayAudit.summary}</span>
                                        </div>
                                        {displayAudit.stats && (
                                            <div className="grid grid-cols-5 gap-4 mt-4">
                                                <div className="text-center">
                                                    <p className="text-lg font-bold text-slate-700">{displayAudit.lineCount || displayAudit.stats.lineCount || '?'}</p>
                                                    <p className="text-[10px] text-slate-400">Lines</p>
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-lg font-bold text-rose-600">{displayAudit.stats.deprecatedAPIs || 0}</p>
                                                    <p className="text-[10px] text-slate-400">Deprecated</p>
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-lg font-bold text-rose-600">{displayAudit.stats.securityIssues || 0}</p>
                                                    <p className="text-[10px] text-slate-400">Security</p>
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-lg font-bold text-amber-600">{displayAudit.stats.performanceIssues || 0}</p>
                                                    <p className="text-[10px] text-slate-400">Performance</p>
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-lg font-bold text-slate-700">{displayAudit.stats.totalIssues || 0}</p>
                                                    <p className="text-[10px] text-slate-400">Total Issues</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Findings */}
                            {displayAudit.findings && displayAudit.findings.length > 0 && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {displayAudit.findings.map((finding: any, idx: number) => (
                                        <div key={idx} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
                                            <div className={`h-1.5 w-full ${finding.type === 'error' ? 'bg-rose-500' :
                                                finding.type === 'warning' ? 'bg-amber-500' : 'bg-sky-500'
                                                }`} />
                                            <div className="p-5 flex-1">
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded ${finding.type === 'error' ? 'text-rose-600 bg-rose-50' :
                                                            finding.type === 'warning' ? 'text-amber-600 bg-amber-50' : 'text-sky-600 bg-sky-50'
                                                            }`}>
                                                            {finding.category}
                                                        </span>
                                                        {finding.lineReference && (
                                                            <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">
                                                                {finding.lineReference}
                                                            </span>
                                                        )}
                                                    </div>
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

                            {displayAudit.findings && displayAudit.findings.length === 0 && (
                                <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-8 text-center">
                                    <CheckCircle size={32} className="text-emerald-500 mx-auto mb-3" />
                                    <p className="font-semibold text-emerald-800">No Issues Found</p>
                                    <p className="text-sm text-emerald-600 mt-1">This web resource passed all checks.</p>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                            <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Zap size={32} className="text-slate-300" />
                            </div>
                            <p className="font-semibold text-slate-500 mb-1">No Audit Results</p>
                            <p className="text-sm text-slate-400">Click &quot;Audit Code&quot; to analyze this web resource with Claude AI.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
