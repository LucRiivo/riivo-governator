import React, { useState, useEffect } from 'react';
import {
    Settings,
    Activity,
    Database,
    Cpu,
    AlertTriangle,
    CheckCircle,
    Zap,
    Code,
    Search,
    RefreshCw,
    Terminal,
    ShieldCheck,
    Layout,
    ChevronRight,
    ChevronDown,
    Box,
    Link as LinkIcon,
    Plus,
    Globe,
    Key,
    X,
    Lock
} from 'lucide-react';

// --- Mock Data ---
const MOCK_FLOWS = [
    { id: '1', name: 'Order Processing - V2', type: 'Cloud Flow', status: 'Active', logic: { trigger: 'When a row is added', steps: 12 }, connRefs: 2 },
    { id: '2', name: 'Notify Account Manager', type: 'Cloud Flow', status: 'Active', logic: { trigger: 'Recurrence', steps: 4 }, connRefs: 1 },
    { id: '3', name: 'Sync Legacy Data', type: 'Cloud Flow', status: 'Warning', logic: { trigger: 'Manual', steps: 45 }, connRefs: 4 },
];

const MOCK_TABLES = [
    { id: 't1', name: 'cr81_Project', logicalName: 'cr81_project', columns: 24, formulas: 3 },
    { id: 't2', name: 'Account', logicalName: 'account', columns: 140, formulas: 5 },
];

const MOCK_ANALYSIS_RESULT = {
    summary: "Logic Audit Completed. 2 Critical issues found in 'Sync Legacy Data'.",
    findings: [
        { type: 'error', category: 'Logic', title: 'Infinite Loop Potential', description: 'Step "Update Row" might re-trigger this flow if no condition check is added.', suggestion: 'Add a "Trigger Condition" to the start of the flow.' },
        { type: 'warning', category: 'Performance', title: 'OData Filter Missing', description: 'The "List Rows" step fetches all accounts without a filter, impacting performance.', suggestion: 'Apply a $filter query to limit results.' },
        { type: 'info', category: 'Connection', title: 'Reference OK', description: 'All connection references are properly mapped for the Production environment.' }
    ]
};

// --- Main App Component ---
export default function App() {
    const [selectedTab, setSelectedTab] = useState('flows');
    const [selectedItem, setSelectedItem] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Tenant State
    const [tenants, setTenants] = useState([
        { id: '1', name: 'Contoso Dev', url: 'contoso-dev.crm.dynamics.com', status: 'connected' }
    ]);
    const [activeTenant, setActiveTenant] = useState(tenants[0]);

    const handleStartAnalysis = () => {
        setIsAnalyzing(true);
        setAnalysisResult(null);
        setTimeout(() => {
            setIsAnalyzing(false);
            setAnalysisResult(MOCK_ANALYSIS_RESULT);
        }, 2000);
    };

    return (
        <div className="flex h-screen bg-slate-50 text-slate-900 font-sans">
            {/* Sidebar */}
            <aside className="w-72 bg-slate-900 text-white flex flex-col border-r border-slate-800">
                <div className="p-6 flex items-center gap-3 border-b border-slate-800">
                    <div className="bg-indigo-500 p-2 rounded-lg shadow-lg shadow-indigo-500/20">
                        <Cpu size={24} />
                    </div>
                    <h1 className="font-bold text-lg tracking-tight italic">D365 Audit <span className="text-[10px] bg-slate-700 px-1.5 py-0.5 rounded ml-1 not-italic font-normal">v1.2</span></h1>
                </div>

                <div className="p-4 space-y-4 flex-1 overflow-y-auto">
                    {/* Tenant / Project Selector */}
                    <section>
                        <div className="flex items-center justify-between mb-2 px-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Active Tenant</label>
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="text-indigo-400 hover:text-indigo-300 transition-colors"
                            >
                                <Plus size={14} />
                            </button>
                        </div>
                        <div className="space-y-1">
                            {tenants.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => setActiveTenant(t)}
                                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all text-left ${activeTenant.id === t.id
                                        ? 'bg-slate-800 text-white ring-1 ring-slate-700'
                                        : 'text-slate-400 hover:bg-slate-800/50'
                                        }`}
                                >
                                    <Globe size={16} className={activeTenant.id === t.id ? "text-indigo-400" : "text-slate-600"} />
                                    <div className="truncate">
                                        <p className="font-medium leading-none mb-1">{t.name}</p>
                                        <p className="text-[10px] text-slate-500 truncate">{t.url}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </section>

                    <div className="h-px bg-slate-800 mx-2 my-4" />

                    {/* Navigation */}
                    <nav className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2 mb-2 block">Audit Tools</label>
                        <NavItem
                            icon={<Activity size={18} />}
                            label="Cloud Flows"
                            active={selectedTab === 'flows'}
                            onClick={() => setSelectedTab('flows')}
                        />
                        <NavItem
                            icon={<Database size={18} />}
                            label="Tables & Schema"
                            active={selectedTab === 'tables'}
                            onClick={() => setSelectedTab('tables')}
                        />
                        <NavItem
                            icon={<LinkIcon size={18} />}
                            label="Conn. References"
                            active={selectedTab === 'conn'}
                            onClick={() => setSelectedTab('conn')}
                        />
                    </nav>
                </div>

                <div className="p-4 border-t border-slate-800 bg-slate-900/50">
                    <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
                        <div className="flex items-center gap-2 mb-1 text-slate-300">
                            <ShieldCheck size={14} className="text-emerald-400" />
                            <span className="text-xs font-semibold">Live Connection</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mb-2">Authenticated via Service Principal</p>
                        <div className="flex items-center justify-between pt-2 border-t border-slate-700 mt-2">
                            <span className="text-[10px] text-slate-400">Token expires in 42m</span>
                            <RefreshCw size={10} className="text-slate-500 cursor-pointer hover:text-indigo-400" />
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 z-10">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder="Search components in this tenant..."
                                className="pl-10 pr-4 py-2 border border-slate-200 rounded-full text-sm w-72 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="flex flex-col items-end">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Current Env</span>
                            <span className="text-sm font-semibold text-indigo-600">{activeTenant.name}</span>
                        </div>
                        <div className="h-8 w-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold shadow-inner">
                            JD
                        </div>
                    </div>
                </header>

                {/* Dynamic Content Area */}
                <div className="flex-1 flex overflow-hidden">
                    {/* List Area */}
                    <div className="w-80 border-r border-slate-200 overflow-y-auto bg-white shadow-sm z-0">
                        <div className="p-4 border-b border-slate-100 sticky top-0 bg-white/90 backdrop-blur-md z-10 flex items-center justify-between">
                            <h2 className="font-bold text-slate-800 text-xs tracking-wider uppercase">
                                {selectedTab === 'flows' ? 'Solution Flows' : 'Dataverse Tables'}
                            </h2>
                            <button className="text-slate-400 hover:text-indigo-600 transition-colors">
                                <RefreshCw size={14} />
                            </button>
                        </div>
                        <div className="divide-y divide-slate-50">
                            {selectedTab === 'flows' && MOCK_FLOWS.map(flow => (
                                <div
                                    key={flow.id}
                                    onClick={() => setSelectedItem(flow)}
                                    className={`p-4 cursor-pointer transition-all border-l-4 ${selectedItem?.id === flow.id ? 'bg-indigo-50/50 border-indigo-500' : 'hover:bg-slate-50 border-transparent'}`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="font-semibold text-slate-900 text-sm">{flow.name}</span>
                                        <StatusBadge status={flow.status} />
                                    </div>
                                    <div className="flex gap-3 text-[11px] text-slate-500 font-medium">
                                        <span className="flex items-center gap-1 opacity-70"><Terminal size={12} /> {flow.logic.steps} steps</span>
                                        <span className="flex items-center gap-1 opacity-70"><LinkIcon size={12} /> {flow.connRefs} refs</span>
                                    </div>
                                </div>
                            ))}
                            {selectedTab === 'tables' && MOCK_TABLES.map(table => (
                                <div
                                    key={table.id}
                                    onClick={() => setSelectedItem(table)}
                                    className={`p-4 cursor-pointer transition-all border-l-4 ${selectedItem?.id === table.id ? 'bg-indigo-50/50 border-indigo-500' : 'hover:bg-slate-50 border-transparent'}`}
                                >
                                    <div className="font-semibold text-slate-900 text-sm">{table.name}</div>
                                    <div className="text-[10px] text-slate-400 font-mono mb-2 bg-slate-100 px-1 py-0.5 rounded inline-block">{table.logicalName}</div>
                                    <div className="flex gap-3 text-[11px] text-slate-500">
                                        <span className="flex items-center gap-1"><Layout size={12} /> {table.columns} columns</span>
                                        <span className="flex items-center gap-1"><Code size={12} /> {table.formulas} Power Fx</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Editor/Analysis Area */}
                    <div className="flex-1 bg-slate-50 p-8 overflow-y-auto">
                        {!selectedItem ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
                                <div className="bg-white p-8 rounded-full shadow-sm border border-slate-100">
                                    <Box size={64} className="text-slate-200" />
                                </div>
                                <div className="text-center">
                                    <p className="font-semibold text-slate-500">No Component Selected</p>
                                    <p className="text-sm">Pick a flow or table from the list to analyze its logic.</p>
                                </div>
                            </div>
                        ) : (
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
                                                <Globe size={12} /> {activeTenant.url}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleStartAnalysis}
                                        disabled={isAnalyzing}
                                        className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
                                    >
                                        {isAnalyzing ? <RefreshCw className="animate-spin" size={20} /> : <Zap size={20} fill="currentColor" />}
                                        {isAnalyzing ? 'Running Audit...' : 'Audit Logic with Claude'}
                                    </button>
                                </div>

                                {/* Analysis Results */}
                                {analysisResult && (
                                    <div className="grid grid-cols-1 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                        <div className="p-4 bg-slate-900 text-white rounded-xl flex items-center justify-between border border-slate-700">
                                            <div className="flex items-center gap-3">
                                                <div className="bg-emerald-500/20 p-1.5 rounded-full">
                                                    <CheckCircle size={18} className="text-emerald-400" />
                                                </div>
                                                <span className="font-medium">{analysisResult.summary}</span>
                                            </div>
                                            <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded font-mono uppercase">claude-2.5-flash</span>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {analysisResult.findings.map((finding, idx) => (
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
                                                        <p className="text-slate-600 text-sm mb-4 leading-relaxed">{finding.description}</p>
                                                        <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100/50 flex items-start gap-3">
                                                            <Zap size={16} className="text-indigo-500 mt-0.5 flex-shrink-0" />
                                                            <p className="text-sm text-slate-700 italic font-medium">"{finding.suggestion}"</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Code Preview */}
                                <div className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
                                    <div className="bg-slate-800/80 px-5 py-3 flex items-center justify-between border-b border-slate-700/50">
                                        <div className="flex items-center gap-2 text-slate-300 text-xs font-mono">
                                            <Code size={14} className="text-indigo-400" />
                                            {selectedItem.logicalName || 'flow_definition'}.json
                                        </div>
                                        <div className="flex gap-1">
                                            <div className="w-2.5 h-2.5 rounded-full bg-slate-600" />
                                            <div className="w-2.5 h-2.5 rounded-full bg-slate-600" />
                                            <div className="w-2.5 h-2.5 rounded-full bg-slate-600" />
                                        </div>
                                    </div>
                                    <div className="p-6 font-mono text-sm overflow-x-auto text-emerald-400/90 whitespace-pre leading-relaxed h-64 scrollbar-thin scrollbar-thumb-slate-700">
                                        {`{\n  "tenantId": "${activeTenant.id}",\n  "logicalName": "${selectedItem.logicalName || 'workflow_01'}",\n  "type": "${selectedTab}",\n  "clientData": {\n    "trigger": "${selectedItem.logic?.trigger || 'onUpdate'}",\n    "actions": [\n      { "type": "ApiConnection", "operation": "GetRecord", "connection": "@parameters('$connections')['shared_commondataserviceforapps']['connectionId']" },\n      { "type": "Condition", "expression": "equals(triggerBody()?.statuscode, 1)" }\n    ]\n  }\n}`}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* Connection Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-indigo-600 p-8 text-white relative">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="absolute top-6 right-6 text-white/60 hover:text-white"
                            >
                                <X size={24} />
                            </button>
                            <div className="bg-white/20 w-12 h-12 rounded-2xl flex items-center justify-center mb-4">
                                <Lock size={24} />
                            </div>
                            <h2 className="text-2xl font-bold">Connect New Tenant</h2>
                            <p className="text-indigo-100 text-sm mt-1">Authenticate using a Service Principal (App Registration)</p>
                        </div>

                        <div className="p-8 space-y-5">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter ml-1">Friendly Name</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Client X - Production"
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter ml-1">Environment URL</label>
                                <div className="relative">
                                    <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <input
                                        type="text"
                                        placeholder="org-name.crm.dynamics.com"
                                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-2">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter ml-1">Client ID</label>
                                    <input type="text" placeholder="00000000-0000..." className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none text-xs" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter ml-1">Client Secret</label>
                                    <input type="password" placeholder="••••••••••••" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none text-xs" />
                                </div>
                            </div>

                            <div className="pt-6">
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/10 flex items-center justify-center gap-2"
                                >
                                    <Key size={18} className="text-indigo-400" />
                                    Validate & Connect
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// --- Sub-components ---

function NavItem({ icon, label, active, onClick }) {
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all font-medium ${active
                ? 'bg-white text-indigo-600 shadow-[0_4px_12px_rgba(0,0,0,0.2)]'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                }`}
        >
            <span className={active ? "text-indigo-600" : "text-slate-500"}>{icon}</span>
            <span className="flex-1 text-left">{label}</span>
            {active && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 ml-auto" />}
        </button>
    );
}

function StatusBadge({ status }) {
    const styles = {
        Active: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
        Warning: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
        Draft: 'bg-slate-500/10 text-slate-500 border-slate-500/20'
    };

    return (
        <span className={`text-[9px] px-2 py-0.5 rounded-md border font-black uppercase tracking-wider ${styles[status]}`}>
            {status}
        </span>
    );
}