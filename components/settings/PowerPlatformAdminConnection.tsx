import React, { useState, useEffect } from 'react';
import { X, HardDrive, Key, TestTube, CheckCircle2, XCircle, Trash2, Loader2, Building2 } from 'lucide-react';
import { useMutation, useQuery, useAction } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';

interface PowerPlatformAdminConnectionProps {
    isOpen: boolean;
    onClose: () => void;
    tenantId?: string;
    orgId?: string;
}

export default function PowerPlatformAdminConnection({ isOpen, onClose, tenantId, orgId }: PowerPlatformAdminConnectionProps) {
    const [ppTenantId, setPpTenantId] = useState('');
    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [loading, setLoading] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
    const [testing, setTesting] = useState(false);

    const saveConnection = useAction(api.actions.credentials.savePPAdminConnection);
    const deleteConnection = useMutation(api.mutations.deletePPAdminConnection);
    const testConnection = useAction(api.actions.storage.testPPAdminConnection);

    const existingConnection = useQuery(
        api.queries.getPPAdminConnection,
        tenantId ? { tenantId } : "skip"
    );

    useEffect(() => {
        if (existingConnection) {
            setPpTenantId(existingConnection.ppTenantId);
            setClientId(existingConnection.clientId);
            setClientSecret('');
            setDisplayName(existingConnection.displayName || '');
        }
    }, [existingConnection]);

    const handleTest = async () => {
        if (!ppTenantId || !clientId || !clientSecret) return;
        setTesting(true);
        setTestResult(null);
        try {
            const result = await testConnection({
                ppTenantId,
                clientId,
                clientSecret,
            });
            setTestResult(result);
        } catch (error: any) {
            setTestResult({ success: false, message: error.message || 'Test failed' });
        } finally {
            setTesting(false);
        }
    };

    const handleSave = async () => {
        if (!tenantId || !ppTenantId || !clientId || !clientSecret) return;
        setLoading(true);
        try {
            await saveConnection({
                tenantId,
                ppTenantId,
                clientId,
                clientSecret,
                displayName: displayName || undefined,
                orgId,
            });
            onClose();
        } catch (error) {
            console.error("Failed to save PP Admin connection:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!existingConnection) return;
        if (confirm("Remove this Power Platform Admin connection?")) {
            await deleteConnection({ id: existingConnection._id as Id<"pp_admin_connections"> });
            setPpTenantId('');
            setClientId('');
            setClientSecret('');
            setDisplayName('');
            setTestResult(null);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="bg-teal-600 p-8 text-white relative">
                    <button
                        onClick={onClose}
                        className="absolute top-6 right-6 text-white/60 hover:text-white"
                    >
                        <X size={24} />
                    </button>
                    <div className="bg-white/20 w-12 h-12 rounded-2xl flex items-center justify-center mb-4">
                        <HardDrive size={24} />
                    </div>
                    <h2 className="text-2xl font-bold">Power Platform Admin API</h2>
                    <p className="text-teal-100 text-sm mt-1">
                        Connect to the Power Platform Admin API for environment storage data
                    </p>
                </div>

                {/* Form */}
                <div className="p-8 space-y-5">
                    {existingConnection && (
                        <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 size={16} className="text-teal-600" />
                                <span className="text-sm text-teal-700 font-medium">
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
                            placeholder="e.g. Production PP Admin"
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter ml-1">
                            Azure AD Tenant ID
                        </label>
                        <div className="relative">
                            <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="text"
                                value={ppTenantId}
                                onChange={e => setPpTenantId(e.target.value)}
                                placeholder="e.g. 00000000-0000-0000-0000-000000000000"
                                className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm"
                            />
                        </div>
                        <p className="text-[10px] text-slate-400 ml-1">
                            Your Azure Active Directory Tenant ID (GUID)
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter ml-1">
                            Client ID
                        </label>
                        <input
                            type="text"
                            value={clientId}
                            onChange={e => setClientId(e.target.value)}
                            placeholder="e.g. 00000000-0000-0000-0000-000000000000"
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm"
                        />
                        <p className="text-[10px] text-slate-400 ml-1">
                            App Registration Client ID with Power Platform Admin permissions
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter ml-1">
                            Client Secret
                        </label>
                        <div className="relative">
                            <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="password"
                                value={clientSecret}
                                onChange={e => setClientSecret(e.target.value)}
                                placeholder={existingConnection ? "••••••••••• (enter new secret to update)" : "Paste your client secret"}
                                className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm"
                            />
                        </div>
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
                            disabled={testing || !ppTenantId || !clientId || !clientSecret}
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
                            disabled={loading || !ppTenantId || !clientId || !clientSecret}
                            className="flex-1 bg-teal-600 text-white py-3 rounded-2xl font-bold hover:bg-teal-700 transition-all shadow-xl shadow-teal-600/10 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
