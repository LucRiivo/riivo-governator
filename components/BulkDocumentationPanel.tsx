'use client';

import React, { useState } from 'react';
import { useAction, useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { FileText, X, AlertTriangle, CheckCircle, XCircle, SkipForward, Loader2 } from 'lucide-react';
import ConfluencePagePicker, { ConfluencePageSelection } from './ConfluencePagePicker';

interface BulkDocumentationPanelProps {
    isOpen: boolean;
    onClose: () => void;
    tenantId: string;
    orgId?: string;
}

export default function BulkDocumentationPanel({ isOpen, onClose, tenantId, orgId }: BulkDocumentationPanelProps) {
    const [regenerateExisting, setRegenerateExisting] = useState(false);
    const [isStarting, setIsStarting] = useState(false);
    const [startError, setStartError] = useState<string | null>(null);
    const [selectedParentPage, setSelectedParentPage] = useState<ConfluencePageSelection | null>(null);

    const stats = useQuery(api.queries.getFlowDocumentationStats, { tenantId });
    const job = useQuery(api.queries.getBulkDocJob, { tenantId });
    const confluenceSettings = useQuery(api.documentation.getConfluenceSettings);

    const startBulk = useAction(api.actions.documentation.startBulkDocumentation);
    const cancelJob = useMutation(api.mutations.cancelBulkDocJob);

    const isRunning = job?.status === 'running';
    const isDone = job?.status === 'completed' || job?.status === 'failed' || job?.status === 'cancelled';

    const handleStart = async () => {
        setIsStarting(true);
        setStartError(null);
        try {
            await startBulk({ tenantId, orgId, regenerateExisting, parentPageId: selectedParentPage?.id });
        } catch (err: any) {
            setStartError(err.message || 'Failed to start bulk documentation');
        } finally {
            setIsStarting(false);
        }
    };

    const handleCancel = async () => {
        if (!job?._id) return;
        try {
            await cancelJob({ jobId: job._id });
        } catch (err) {
            console.error('Failed to cancel job:', err);
        }
    };

    if (!isOpen) return null;

    const progressPercent = job && job.totalFlows > 0
        ? Math.round(((job.completedFlows + job.failedFlows + job.skippedFlows) / job.totalFlows) * 100)
        : 0;

    const phaseLabel: Record<string, string> = {
        fetching: 'Fetching flow definitions from D365...',
        generating: 'Generating documentation with AI...',
        publishing: 'Publishing to Confluence...',
        done: 'Complete',
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                    <div className="flex items-center gap-3">
                        <div className="bg-violet-100 w-10 h-10 rounded-xl flex items-center justify-center">
                            <FileText className="w-5 h-5 text-violet-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">Bulk Documentation Generator</h2>
                            <p className="text-xs text-slate-400">Generate & publish docs for all flows</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                    {/* Pre-flight Stats */}
                    <div className="grid grid-cols-2 gap-3">
                        <StatCard label="Flows synced" value={stats?.totalFlows ?? '—'} />
                        <StatCard label="With definitions" value={stats?.withDefinitions ?? '—'} />
                        <StatCard label="Already documented" value={stats?.documented ?? '—'} />
                        <StatCard label="Published" value={stats?.published ?? '—'} />
                    </div>

                    {/* Confluence status */}
                    <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
                        confluenceSettings?.spaceKey
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                    }`}>
                        {confluenceSettings?.spaceKey ? (
                            <>
                                <CheckCircle className="w-4 h-4" />
                                <span>Confluence connected — space <strong>{confluenceSettings.spaceKey}</strong></span>
                            </>
                        ) : (
                            <>
                                <AlertTriangle className="w-4 h-4" />
                                <span>No Confluence settings configured. Docs will be saved as drafts only.</span>
                            </>
                        )}
                    </div>

                    {/* Options */}
                    {!isRunning && (
                        <div className="space-y-3">
                            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={regenerateExisting}
                                    onChange={(e) => setRegenerateExisting(e.target.checked)}
                                    className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                                />
                                Regenerate existing documentation
                            </label>

                            {confluenceSettings?.spaceKey && (
                                <ConfluencePagePicker
                                    selectedPage={selectedParentPage}
                                    onSelectPage={setSelectedParentPage}
                                    disabled={isStarting}
                                    label="Publish under page"
                                />
                            )}
                        </div>
                    )}

                    {/* Progress Section */}
                    {isRunning && job && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-sm text-slate-500">
                                <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                                <span>{phaseLabel[job.phase] || job.phase}</span>
                            </div>

                            {/* Progress Bar */}
                            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                                <div
                                    className="bg-violet-500 h-full rounded-full transition-all duration-500 ease-out"
                                    style={{ width: `${progressPercent}%` }}
                                />
                            </div>

                            {/* Counters */}
                            <div className="flex items-center gap-4 text-xs text-slate-500">
                                <span className="flex items-center gap-1">
                                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                                    {job.completedFlows} generated
                                </span>
                                <span className="flex items-center gap-1">
                                    <FileText className="w-3.5 h-3.5 text-blue-500" />
                                    {job.publishedFlows} published
                                </span>
                                <span className="flex items-center gap-1">
                                    <XCircle className="w-3.5 h-3.5 text-red-400" />
                                    {job.failedFlows} failed
                                </span>
                                <span className="flex items-center gap-1">
                                    <SkipForward className="w-3.5 h-3.5 text-slate-400" />
                                    {job.skippedFlows} skipped
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Completed Summary */}
                    {isDone && job && (
                        <div className={`rounded-xl p-4 border ${
                            job.status === 'completed' ? 'bg-emerald-50 border-emerald-200' :
                            job.status === 'cancelled' ? 'bg-slate-50 border-slate-200' :
                            'bg-red-50 border-red-200'
                        }`}>
                            <div className="flex items-center gap-2 mb-2">
                                {job.status === 'completed' && <CheckCircle className="w-5 h-5 text-emerald-600" />}
                                {job.status === 'failed' && <XCircle className="w-5 h-5 text-red-600" />}
                                {job.status === 'cancelled' && <X className="w-5 h-5 text-slate-500" />}
                                <span className="font-semibold text-sm capitalize">{job.status}</span>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-slate-600">
                                <span>{job.completedFlows} generated</span>
                                <span>{job.publishedFlows} published</span>
                                <span>{job.failedFlows} failed</span>
                                <span>{job.skippedFlows} skipped</span>
                            </div>
                            {job.completedAt && (
                                <p className="text-xs text-slate-400 mt-1">
                                    Completed {new Date(job.completedAt).toLocaleString()}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Errors */}
                    {job && job.errors.length > 0 && (
                        <div className="space-y-1">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                Errors ({job.errors.length})
                            </p>
                            <div className="max-h-40 overflow-y-auto space-y-1">
                                {job.errors.map((err, i) => (
                                    <div key={i} className="flex items-start gap-2 text-xs bg-red-50 rounded-lg px-3 py-2">
                                        <XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                                        <div>
                                            <span className="font-medium text-slate-700">{err.flowName}</span>
                                            <span className="text-slate-400 ml-1">[{err.phase}]</span>
                                            <p className="text-red-600">{err.error}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Start Error */}
                    {startError && (
                        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                            {startError}
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
                    {isRunning ? (
                        <button
                            onClick={handleCancel}
                            className="bg-red-50 text-red-600 px-5 py-2.5 rounded-xl font-semibold hover:bg-red-100 transition-all text-sm"
                        >
                            Cancel
                        </button>
                    ) : (
                        <>
                            <button
                                onClick={onClose}
                                className="text-slate-500 px-5 py-2.5 rounded-xl font-semibold hover:bg-slate-100 transition-all text-sm"
                            >
                                Close
                            </button>
                            <button
                                onClick={handleStart}
                                disabled={isStarting || !stats || stats.totalFlows === 0}
                                className="bg-violet-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-violet-700 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isStarting && <Loader2 className="w-4 h-4 animate-spin" />}
                                {isStarting ? 'Starting...' : 'Generate & Publish All'}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
            <p className="text-2xl font-bold text-slate-800 mt-0.5">{value}</p>
        </div>
    );
}
