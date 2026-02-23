import React, { useState, useEffect } from 'react';
import { X, BarChart3, Key, TestTube, CheckCircle2, XCircle, Trash2, Loader2 } from 'lucide-react';
import { useMutation, useQuery, useAction } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';

interface AppInsightsConnectionProps {
    isOpen: boolean;
    onClose: () => void;
    tenantId?: string;
    orgId?: string;
}

export default function AppInsightsConnection({ isOpen, onClose, tenantId, orgId }: AppInsightsConnectionProps) {
    const [appInsightsAppId, setAppInsightsAppId] = useState('');
    const [apiKeyValue, setApiKeyValue] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [loading, setLoading] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
    const [testing, setTesting] = useState(false);

    const saveConnection = useAction(api.actions.credentials.saveAppInsightsConnection);
    const deleteConnection = useMutation(api.mutations.deleteAppInsightsConnection);
    const testConnection = useAction(api.actions.telemetry.testAppInsightsConnection);

    const existingConnection = useQuery(
        api.queries.getAppInsightsConnection,
        tenantId ? { tenantId } : "skip"
    );

    // Populate form when existing connection is loaded
    useEffect(() => {
        if (existingConnection) {
            setAppInsightsAppId(existingConnection.appInsightsAppId);
            setApiKeyValue(''); // Don't show existing key
            setDisplayName(existingConnection.displayName || '');
        }
    }, [existingConnection]);

    const handleTest = async () => {
        if (!appInsightsAppId || !apiKeyValue) return;
        setTesting(true);
        setTestResult(null);
        try {
            const result = await testConnection({
                appInsightsAppId,
                apiKey: apiKeyValue,
            });
            setTestResult(result);
        } catch (error: any) {
            setTestResult({ success: false, message: error.message || 'Test failed' });
        } finally {
            setTesting(false);
        }
    };

    const handleSave = async () => {
        if (!tenantId || !appInsightsAppId || !apiKeyValue) return;
        setLoading(true);
        try {
            await saveConnection({
                tenantId,
                appInsightsAppId,
                apiKey: apiKeyValue,
                displayName: displayName || undefined,
                orgId,
            });
            onClose();
        } catch (error) {
            console.error("Failed to save App Insights connection:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!existingConnection) return;
        if (confirm("Remove this Application Insights connection?")) {
            await deleteConnection({ id: existingConnection._id as Id<"app_insights_connections"> });
            setAppInsightsAppId('');
            setApiKeyValue('');
            setDisplayName('');
            setTestResult(null);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="bg-violet-600 p-8 text-white relative">
                    <button
                        onClick={onClose}
                        className="absolute top-6 right-6 text-white/60 hover:text-white"
                    >
                        <X size={24} />
                    </button>
                    <div className="bg-white/20 w-12 h-12 rounded-2xl flex items-center justify-center mb-4">
                        <BarChart3 size={24} />
                    </div>
                    <h2 className="text-2xl font-bold">Application Insights</h2>
                    <p className="text-violet-100 text-sm mt-1">
                        Connect to Azure Application Insights for telemetry data
                    </p>
                </div>

                {/* Form */}
                <div className="p-8 space-y-5">
                    {existingConnection && (
                        <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 size={16} className="text-violet-600" />
                                <span className="text-sm text-violet-700 font-medium">
                                    Connected{existingConnection.displayName ? `: ${existingConnection.displayName}` : ''}
                                </span>
                            </div>
                            <button
                                onClick={handleDelete}
                                className="text-rose-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition-colors"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter ml-1">
                            Friendly Name (optional)
                        </label>
                        <input
                            type="text"
                            value={displayName}
                            onChange={e => setDisplayName(e.target.value)}
                            placeholder="e.g. Production App Insights"
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter ml-1">
                            Application ID
                        </label>
                        <input
                            type="text"
                            value={appInsightsAppId}
                            onChange={e => setAppInsightsAppId(e.target.value)}
                            placeholder="e.g. 00000000-0000-0000-0000-000000000000"
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all text-sm"
                        />
                        <p className="text-[10px] text-slate-400 ml-1">
                            Found in Azure Portal &gt; Application Insights &gt; API Access
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter ml-1">
                            API Key
                        </label>
                        <div className="relative">
                            <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="password"
                                value={apiKeyValue}
                                onChange={e => setApiKeyValue(e.target.value)}
                                placeholder={existingConnection ? "••••••••••• (enter new key to update)" : "Paste your API key"}
                                className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all text-sm"
                            />
                        </div>
                        <p className="text-[10px] text-slate-400 ml-1">
                            Create a read-only API key in Azure Portal &gt; Application Insights &gt; API Access
                        </p>
                    </div>

                    {/* Test Result */}
                    {testResult && (
                        <div className={`rounded-xl p-3 flex items-center gap-2 text-sm ${testResult.success
                            ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                            : 'bg-rose-50 border border-rose-200 text-rose-700'
                            }`}>
                            {testResult.success
                                ? <CheckCircle2 size={16} />
                                : <XCircle size={16} />
                            }
                            {testResult.message}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-4">
                        <button
                            onClick={handleTest}
                            disabled={testing || !appInsightsAppId || !apiKeyValue}
                            className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-2xl font-semibold hover:bg-slate-200 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {testing ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <TestTube size={16} />
                            )}
                            {testing ? 'Testing...' : 'Test Connection'}
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={loading || !appInsightsAppId || !apiKeyValue}
                            className="flex-1 bg-violet-600 text-white py-3 rounded-2xl font-bold hover:bg-violet-700 transition-all shadow-xl shadow-violet-600/10 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <Key size={16} />
                            )}
                            {loading ? 'Saving...' : 'Save Connection'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
