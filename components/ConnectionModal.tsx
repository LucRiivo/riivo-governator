
import React, { useState } from 'react';
import { X, Lock, Globe, Key } from 'lucide-react';
import { useAction } from 'convex/react';
import { api } from '@/convex/_generated/api';

interface ConnectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    orgId?: string; // Add orgId prop
}

export default function ConnectionModal({ isOpen, onClose, orgId }: ConnectionModalProps) {
    const addTenant = useAction(api.actions.credentials.addTenant);
    const [name, setName] = useState('');
    const [url, setUrl] = useState('');
    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [tenantDirectoryId, setTenantDirectoryId] = useState('');
    const [loading, setLoading] = useState(false);

    const handleConnect = async () => {
        setLoading(true);
        try {
            await addTenant({ name, url, clientId, clientSecret, tenantDirectoryId, orgId });
            onClose();
            // Reset form
            setName('');
            setUrl('');
            setClientId('');
            setClientSecret('');
            setTenantDirectoryId('');
        } catch (error) {
            console.error("Failed to add tenant:", error);
            alert("Failed to add tenant");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="bg-indigo-600 p-8 text-white relative">
                    <button
                        onClick={onClose}
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
                            value={name}
                            onChange={e => setName(e.target.value)}
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
                                value={url}
                                onChange={e => setUrl(e.target.value)}
                                placeholder="org-name.crm.dynamics.com"
                                className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter ml-1">Client ID</label>
                        <input
                            type="text"
                            value={clientId}
                            onChange={e => setClientId(e.target.value)}
                            placeholder="00000000-0000..."
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none text-xs"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-2">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter ml-1">Client Secret</label>
                            <input
                                type="password"
                                value={clientSecret}
                                onChange={e => setClientSecret(e.target.value)}
                                placeholder="••••••••••••"
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none text-xs"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter ml-1">Directory (Tenant) ID</label>
                            <input
                                type="text"
                                value={tenantDirectoryId}
                                onChange={e => setTenantDirectoryId(e.target.value)}
                                placeholder="Optional (if not multi-tenant)"
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none text-xs"
                            />
                        </div>
                    </div>

                    <div className="pt-6">
                        <button
                            onClick={handleConnect}
                            disabled={loading}
                            className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/10 flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <Key size={18} className="text-indigo-400" />
                            {loading ? 'Connecting...' : 'Validate & Connect'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
