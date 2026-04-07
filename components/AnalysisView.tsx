
import { useAction, useQuery } from "convex/react";
import React, { useEffect, useState, useMemo } from 'react';
// Use require to avoid TS2589 type depth limit with large Convex schema
const { api } = require('@/convex/_generated/api') as { api: any };
import {
    Activity,
    Database,
    Zap,
    RefreshCw,
    Box,
    CheckCircle,
    Code,
    Globe,
    Table
} from 'lucide-react';
import { Tenant } from './Sidebar';
import DocumentationEditor from './DocumentationEditor';

// Definitions for props
interface AnalysisResult {
    summary: string;
    findings: {
        type: string;
        category: string;
        title: string;
        description: string;
        suggestion: string;
    }[];
}

interface AnalysisViewProps {
    selectedItem: any; // Using any for simplicity as per mockup, could be typed strictly
    selectedTab: string;
    activeTenant: Tenant | null;
    isAnalyzing: boolean;
    analysisResult: AnalysisResult | null;
    onStartAnalysis: () => void;
    orgId?: string; // Clerk Organization ID
}

export default function AnalysisView({
    selectedItem,
    selectedTab,
    activeTenant,
    isAnalyzing,
    analysisResult: latestAnalysisResult, // Rename prop to avoid confusion
    onStartAnalysis,
    orgId
}: AnalysisViewProps) {
    const getFlowDefinition = useAction(api.actions.getFlowDefinition);
    const getTableSchema = useAction(api.actions.getTableSchema);

    const [flowDefinition, setFlowDefinition] = useState<any>(null);
    const [tableSchema, setTableSchema] = useState<any>(null);
    const [loadingDef, setLoadingDef] = useState(false);

    const [selectedSubTab, setSelectedSubTab] = useState<'audit' | 'docs'>('audit');

    // Fetch cached audit result (only for flows)
    const cachedAudit = useQuery(api.queries.getAuditResult,
        selectedItem && selectedTab === 'flows' && selectedItem.workflowId ? { flowId: selectedItem._id } : "skip"
    );

    // Determine which result to show: recently run one (prop) or cached one
    const displayResult = useMemo(() => {
        if (latestAnalysisResult) return latestAnalysisResult;
        if (cachedAudit && cachedAudit.result) {
            try {
                return JSON.parse(cachedAudit.result);
            } catch (e) {
                console.error("Failed to parse cached audit", e);
                return null;
            }
        }
        return null;
    }, [latestAnalysisResult, cachedAudit]);

    // Fetch flow definition when a flow is selected
    useEffect(() => {
        if (selectedItem && selectedTab === 'flows' && activeTenant?.tenantId && selectedItem.workflowId) {
            setLoadingDef(true);
            setTableSchema(null);
            // Use workflowId (GUID) for Dynamics API call
            getFlowDefinition({ tenantId: activeTenant.tenantId, flowId: selectedItem.workflowId, orgId })
                .then((data: any) => {
                    const parsed = {
                        ...data,
                        clientData: JSON.parse(data.clientDataJSON || "{}")
                    };
                    setFlowDefinition(parsed);
                })
                .catch(err => {
                    console.error("Failed to fetch def:", err);
                    setFlowDefinition(null);
                })
                .finally(() => setLoadingDef(false));

            // Reset subtab to audit on new selection (optional, maybe better persistance)
            // setSelectedSubTab('audit'); 
        } else {
            setFlowDefinition(null);
        }
    }, [selectedItem, selectedTab, activeTenant, getFlowDefinition, orgId]);

    // Fetch table schema when a table is selected
    useEffect(() => {
        if (selectedItem && selectedTab === 'tables' && activeTenant?.tenantId && selectedItem.logicalName) {
            setLoadingDef(true);
            setFlowDefinition(null);
            getTableSchema({ tenantId: activeTenant.tenantId, logicalName: selectedItem.logicalName, orgId })
                .then((data: any) => {
                    setTableSchema(data);
                })
                .catch(err => {
                    console.error("Failed to fetch schema:", err);
                    setTableSchema(null);
                })
                .finally(() => setLoadingDef(false));
        } else {
            setTableSchema(null);
        }
    }, [selectedItem, selectedTab, activeTenant, getTableSchema, orgId]);

    if (!selectedItem) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
                <div className="bg-white p-8 rounded-full shadow-sm border border-slate-100">
                    <Box size={64} className="text-slate-200" />
                </div>
                <div className="text-center">
                    <p className="font-semibold text-slate-500">No Component Selected</p>
                    <p className="text-sm">Pick a flow or table from the list to analyze its logic.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            {/* Action Bar */}
            <div className="flex items-center justify-between bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600">
                        {selectedTab === 'flows' ? <Activity size={24} /> : <Database size={24} />}
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-slate-800">{selectedItem.name}</h3>
                        <p className="text-sm text-slate-500 flex items-center gap-2">
                            <Globe size={12} /> {activeTenant?.url || 'No connection'}
                            {selectedTab === 'tables' && selectedItem.logicalName && (
                                <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-mono ml-2">
                                    {selectedItem.logicalName}
                                </span>
                            )}
                        </p>
                    </div>
                </div>

                {selectedTab === 'flows' && (
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button
                            onClick={() => setSelectedSubTab('audit')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedSubTab === 'audit'
                                ? 'bg-white text-slate-800 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            Audit Logic
                        </button>
                        <button
                            onClick={() => setSelectedSubTab('docs')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedSubTab === 'docs'
                                ? 'bg-white text-slate-800 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            Documentation
                        </button>
                    </div>
                )}
            </div>

            {selectedTab === 'flows' && selectedSubTab === 'docs' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <DocumentationEditor
                        flowId={selectedItem._id}
                        tenantId={activeTenant?.tenantId || ''}
                    />
                </div>
            )}

            {/* Analysis Results (Flows only) */}
            {selectedTab === 'flows' && selectedSubTab === 'audit' && (
                <>
                    {/* Audit Action Button */}
                    <div className="flex justify-end">
                        <button
                            onClick={onStartAnalysis}
                            disabled={isAnalyzing}
                            className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
                        >
                            {isAnalyzing ? <RefreshCw className="animate-spin" size={20} /> : <Zap size={20} fill="currentColor" />}
                            {isAnalyzing ? 'Running Audit...' : (displayResult ? 'Re-run Audit' : 'Audit Logic with Claude')}
                        </button>
                    </div>

                    {displayResult && (
                        <div className="grid grid-cols-1 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="p-4 bg-slate-900 text-white rounded-xl flex items-center justify-between border border-slate-700">
                                <div className="flex items-center gap-3">
                                    <div className="bg-emerald-500/20 p-1.5 rounded-full">
                                        <CheckCircle size={18} className="text-emerald-400" />
                                    </div>
                                    <span className="font-medium">{displayResult.summary}</span>
                                </div>
                                <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded font-mono uppercase">claude-2.5-flash</span>
                            </div>

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
                                            </div>
                                            <h4 className="font-bold text-slate-800 mb-2">{finding.title}</h4>
                                            <p className="text-slate-600 text-sm mb-4 leading-relaxed break-words">{finding.description}</p>
                                            <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100/50 flex items-start gap-3">
                                                <Zap size={16} className="text-indigo-500 mt-0.5 flex-shrink-0" />
                                                <p className="text-sm text-slate-700 italic font-medium break-words flex-1 min-w-0">"{finding.suggestion}"</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Code Preview - Only show in audit mode or always? Maybe always useful at bottom */}
                    <div className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl mt-6">
                        <div className="bg-slate-800/80 px-5 py-3 flex items-center justify-between border-b border-slate-700/50">
                            <div className="flex items-center gap-2 text-slate-300 text-xs font-mono">
                                <Code size={14} className="text-indigo-400" />
                                {`${selectedItem.logicalName || 'flow_definition'}.json`}
                                {loadingDef && <span className="text-xs text-slate-500 ml-2 animate-pulse">Fetching from Dynamics 365...</span>}
                            </div>
                            <div className="flex gap-1">
                                <div className="w-2.5 h-2.5 rounded-full bg-slate-600" />
                                <div className="w-2.5 h-2.5 rounded-full bg-slate-600" />
                                <div className="w-2.5 h-2.5 rounded-full bg-slate-600" />
                            </div>
                        </div>
                        <div className="p-6 font-mono text-sm overflow-x-auto text-emerald-400/90 whitespace-pre leading-relaxed h-64 scrollbar-thin scrollbar-thumb-slate-700">
                            {loadingDef ? "// Fetching from Dynamics 365..." :
                                flowDefinition ? JSON.stringify(flowDefinition, null, 2) :
                                    `{\n  // Select a flow to view its definition\n}`}
                        </div>
                    </div>
                </>
            )}

            {/* Table Schema View (Tables only) */}
            {selectedTab === 'tables' && tableSchema && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Table size={16} className="text-indigo-600" />
                            <span className="font-semibold text-slate-800">Schema Columns</span>
                            <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
                                {tableSchema.columnCount} columns
                            </span>
                        </div>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 sticky top-0">
                                <tr className="text-left text-xs text-slate-500 uppercase tracking-wider">
                                    <th className="px-4 py-3 font-semibold">Display Name</th>
                                    <th className="px-4 py-3 font-semibold">Logical Name</th>
                                    <th className="px-4 py-3 font-semibold">Type</th>
                                    <th className="px-4 py-3 font-semibold">Required</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {tableSchema.columns.map((col: any, idx: number) => (
                                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 font-medium text-slate-800">{col.displayName}</td>
                                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{col.logicalName}</td>
                                        <td className="px-4 py-3">
                                            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                                                {col.attributeType}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`text-xs px-2 py-0.5 rounded ${col.requiredLevel === 'ApplicationRequired' || col.requiredLevel === 'SystemRequired'
                                                ? 'bg-rose-50 text-rose-600'
                                                : col.requiredLevel === 'Recommended'
                                                    ? 'bg-amber-50 text-amber-600'
                                                    : 'bg-slate-100 text-slate-500'
                                                }`}>
                                                {col.requiredLevel}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

