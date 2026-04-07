import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useAction } from "convex/react";
import { Id } from "@/convex/_generated/dataModel";
// Use require to avoid TS2589 type depth limit with large Convex schema
const { api } = require('@/convex/_generated/api') as { api: any };
import { FileText, Save, Send, RefreshCw, Globe, Loader2, Check, Settings } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ConfluencePagePicker, { ConfluencePageSelection } from './ConfluencePagePicker';

const markdownComponents = {
    table: ({ children, ...props }: any) => (
        <div className="my-4 overflow-x-auto rounded-lg border border-slate-200 shadow-sm">
            <table className="w-full border-collapse text-sm" {...props}>{children}</table>
        </div>
    ),
    thead: ({ children, ...props }: any) => (
        <thead className="bg-slate-800 text-white" {...props}>{children}</thead>
    ),
    th: ({ children, ...props }: any) => (
        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider border-b border-slate-600" {...props}>{children}</th>
    ),
    tbody: ({ children, ...props }: any) => (
        <tbody className="divide-y divide-slate-100" {...props}>{children}</tbody>
    ),
    tr: ({ children, ...props }: any) => (
        <tr className="even:bg-slate-50/80 hover:bg-indigo-50/50 transition-colors" {...props}>{children}</tr>
    ),
    td: ({ children, ...props }: any) => (
        <td className="px-4 py-2.5 text-slate-700 border-b border-slate-100" {...props}>{children}</td>
    ),
    blockquote: ({ children, ...props }: any) => {
        const text = String(children);
        const isWarning = text.includes('[!WARNING]');
        const isInfo = text.includes('[!INFO]');
        const isSuccess = text.includes('[!SUCCESS]');
        const isError = text.includes('[!ERROR]');
        const bgColor = isError ? 'bg-rose-50 border-rose-300 text-rose-800'
            : isWarning ? 'bg-amber-50 border-amber-300 text-amber-800'
            : isSuccess ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
            : isInfo ? 'bg-sky-50 border-sky-300 text-sky-800'
            : 'bg-slate-50 border-slate-300 text-slate-700';
        return <blockquote className={`my-3 p-4 rounded-lg border-l-4 ${bgColor} not-italic`} {...props}>{children}</blockquote>;
    },
};

interface DocumentationEditorProps {
    flowId: Id<"flows">;
    tenantId: string;
}

export default function DocumentationEditor({ flowId, tenantId }: DocumentationEditorProps) {
    const documentation = useQuery((api as any).documentation.getDocumentation, { flowId });
    const settings = useQuery((api as any).documentation.getConfluenceSettings, {});
    const flow = useQuery(api.queries.getFlowById, { flowId });

    const generateDoc = useAction(api.actions.documentation.generateDocumentation);
    const saveDoc = useMutation(api.documentation.saveDocumentation);
    const saveSettings = useMutation(api.documentation.saveConfluenceSettings);
    const publishDoc = useAction(api.actions.documentation.publishToConfluence);

    const [content, setContent] = useState<string>('');
    const [isEditing, setIsEditing] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [selectedParentPage, setSelectedParentPage] = useState<ConfluencePageSelection | null>(null);

    // Settings Form State
    const [domain, setDomain] = useState('');
    const [email, setEmail] = useState('');
    const [apiToken, setApiToken] = useState('');
    const [spaceKey, setSpaceKey] = useState('');
    const [parentId, setParentId] = useState('');

    useEffect(() => {
        setContent('');
        setIsEditing(false);
    }, [flowId]);

    useEffect(() => {
        if (documentation) {
            setContent(documentation.content);
        } else if (documentation === null) {
            setContent('');
        }
    }, [documentation, flowId]);

    useEffect(() => {
        if (settings) {
            setDomain(settings.domain);
            setEmail(settings.email);
            setApiToken(settings.apiToken);
            setSpaceKey(settings.spaceKey || '');
            setParentId(settings.parentId || '');
        }
    }, [settings]);

    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            const result = await generateDoc({ flowId, tenantId });
            setContent(result);
            // Auto-save draft
            await saveDoc({
                flowId,
                content: result,
                status: 'draft'
            });
            setIsEditing(true);
        } catch (error) {
            console.error("Failed to generate:", error);
            alert("Failed to generate documentation. Please try again.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSave = async () => {
        await saveDoc({
            flowId,
            content,
            status: 'draft'
        });
        setIsEditing(false);
    };

    const handleSaveSettings = async () => {
        await saveSettings({ domain, email, apiToken, spaceKey, parentId });
        setShowSettings(false);
    };

    const handlePublish = async () => {
        if (!settings || !settings.spaceKey) {
            setShowSettings(true);
            return;
        }

        setIsPublishing(true);
        try {
            const result = await publishDoc({
                flowId,
                title: flow ? `⚡ ${flow.name}` : `Flow Documentation`,
                content,
                parentPageId: selectedParentPage?.id,
            });
            alert("Published successfully!");
        } catch (error) {
            console.error("Publish failed:", error);
            alert("Failed to publish.");
        } finally {
            setIsPublishing(false);
        }
    };

    if (documentation === undefined) return <div className="p-8 text-center"><Loader2 className="animate-spin inline text-indigo-500" /></div>;

    if (showSettings) {
        return (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm max-w-lg mx-auto mt-10">
                <h3 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
                    <Settings size={20} className="text-slate-500" />
                    Confluence Configuration
                </h3>
                <p className="text-sm text-slate-500 mb-6">
                    Enter your Atlassian credentials to enable publishing. These are stored securely for your user.
                </p>
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Confluence Domain</label>
                        <input
                            type="text"
                            placeholder="your-company.atlassian.net"
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            value={domain}
                            onChange={e => setDomain(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
                        <input
                            type="email"
                            placeholder="you@company.com"
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">API Token</label>
                        <input
                            type="password"
                            placeholder="Atlassian API Token"
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            value={apiToken}
                            onChange={e => setApiToken(e.target.value)}
                        />
                        <p className="text-[10px] text-slate-400 mt-1">Get a token from <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" className="text-indigo-500 underline" rel="noreferrer">Atlassian Security Settings</a></p>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Space Key</label>
                        <input
                            type="text"
                            placeholder="e.g. ENG, PROD, KB"
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            value={spaceKey}
                            onChange={e => setSpaceKey(e.target.value)}
                        />
                        <p className="text-[10px] text-slate-400 mt-1">The key of the Confluence space where pages will be created.</p>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Parent Page ID (Optional)</label>
                        <input
                            type="text"
                            placeholder="e.g. 12345678"
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            value={parentId}
                            onChange={e => setParentId(e.target.value)}
                        />
                        <p className="text-[10px] text-slate-400 mt-1">If set, all documentation pages will be created as children of this page.</p>
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-8">
                    <button
                        onClick={() => setShowSettings(false)}
                        className="px-4 py-2 text-slate-500 font-medium text-sm hover:text-slate-700"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSaveSettings}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium text-sm hover:bg-indigo-700 transition"
                    >
                        Save Configuration
                    </button>
                </div>
            </div >
        );
    }

    if (!content && !documentation) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center bg-slate-50 rounded-2xl border border-slate-200 border-dashed">
                <div className="bg-white p-4 rounded-full shadow-sm mb-4">
                    <FileText size={32} className="text-indigo-400" />
                </div>
                <h3 className="font-bold text-slate-800 mb-1">No Documentation Yet</h3>
                <p className="text-slate-500 text-sm max-w-xs mb-6">
                    Generate a high-level business summary for this flow using Claude AI.
                </p>
                <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-700 disabled:opacity-50 shadow-md shadow-indigo-500/20 active:scale-95 transition-all"
                >
                    {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />}
                    {isGenerating ? 'Generating...' : 'Generate Documentation'}
                </button>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-200px)]">
            {/* Toolbar */}
            <div className="border-b border-slate-100 p-3 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-200/50 rounded-lg text-xs font-semibold text-slate-600">
                        <FileText size={14} />
                        {documentation?.status === 'published' ? 'Published' : 'Draft'}
                    </div>
                    {documentation?.lastUpdated && (
                        <span className="text-[10px] text-slate-400">
                            Last save: {new Date(documentation.lastUpdated).toLocaleTimeString()}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {isEditing ? (
                        <button
                            onClick={handleSave}
                            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition"
                        >
                            <Save size={14} />
                            Save Draft
                        </button>
                    ) : (
                        <button
                            onClick={() => setIsEditing(true)}
                            className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition"
                        >
                            Edit
                        </button>
                    )}

                    {!isEditing && documentation && (
                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating}
                            className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition"
                            title="Regenerate documentation with latest flow logic"
                        >
                            <RefreshCw size={14} className={isGenerating ? "animate-spin" : ""} />
                            Regenerate
                        </button>
                    )}

                    <div className="h-4 w-px bg-slate-300 mx-1" />

                    <button
                        onClick={() => setShowSettings(true)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                        title="Confluence Settings"
                    >
                        <Settings size={18} />
                    </button>

                    {settings?.spaceKey && !isEditing && (
                        <div className="w-48">
                            <ConfluencePagePicker
                                selectedPage={selectedParentPage}
                                onSelectPage={setSelectedParentPage}
                                disabled={isPublishing}
                                label=""
                            />
                        </div>
                    )}

                    <button
                        onClick={handlePublish}
                        disabled={isPublishing || isEditing}
                        className="flex items-center gap-2 px-4 py-1.5 bg-sky-600 text-white rounded-lg text-sm font-bold hover:bg-sky-700 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isPublishing ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
                        Push to Confluence
                    </button>
                </div>
            </div>

            {/* Editor / Preview */}
            <div className="flex-1 overflow-hidden relative">
                {isEditing ? (
                    <textarea
                        className="w-full h-full p-6 outline-none resize-none font-mono text-sm text-slate-700 bg-slate-50/30"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="Start typing your documentation..."
                    />
                ) : (
                    <div className="w-full h-full p-8 overflow-y-auto prose prose-slate prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{content}</ReactMarkdown>
                    </div>
                )}
            </div>

            {/* Generated Info Footer */}
            {!isEditing && (
                <div className="border-t border-slate-100 p-3 bg-slate-50 text-[10px] text-slate-400 text-center flex justify-center gap-4">
                    <span>Generated by Claude AI</span>
                    {documentation?.confluenceUrl && (
                        <a href={documentation.confluenceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sky-600 hover:underline">
                            <Globe size={10} />
                            View in Confluence
                        </a>
                    )}
                </div>
            )}
        </div>
    );
}
