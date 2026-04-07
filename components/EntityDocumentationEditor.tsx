import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { FileText, Save, Send, RefreshCw, Globe, Loader2, Settings } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import ConfluencePagePicker, { ConfluencePageSelection } from './ConfluencePagePicker';

type DocType = 'security' | 'app' | 'webresource';

interface EntityDocumentationEditorProps {
    docType: DocType;
    tenantId: string;
    // For security: no extra ID needed (tenant-level)
    // For app: appId
    appId?: Id<"model_driven_apps">;
    appName?: string;
    // For web resource: webResourceId + code content
    webResourceId?: Id<"web_resources">;
    webResourceName?: string;
    webResourceType?: string;
    webResourceCode?: string;
}

export default function EntityDocumentationEditor({
    docType,
    tenantId,
    appId,
    appName,
    webResourceId,
    webResourceName,
    webResourceType,
    webResourceCode,
}: EntityDocumentationEditorProps) {
    // Queries - pick the right one based on docType
    const securityDoc = useQuery(
        (api as any).documentation.getSecurityDocumentation,
        docType === 'security' ? { tenantId } : "skip"
    );
    const appDoc = useQuery(
        (api as any).documentation.getAppDocumentation,
        docType === 'app' && appId ? { appId } : "skip"
    );
    const webResourceDoc = useQuery(
        (api as any).documentation.getWebResourceDocumentation,
        docType === 'webresource' && webResourceId ? { webResourceId } : "skip"
    );

    const documentation = docType === 'security' ? securityDoc
        : docType === 'app' ? appDoc
        : webResourceDoc;

    const settings = useQuery((api as any).documentation.getConfluenceSettings, {});

    // Actions
    const generateSecurityDoc = useAction(api.actions.entityDocumentation.generateSecurityDocumentation);
    const generateAppDoc = useAction(api.actions.entityDocumentation.generateAppDocumentation);
    const generateWebResourceDoc = useAction(api.actions.entityDocumentation.generateWebResourceDocumentation);

    const publishSecurityDoc = useAction(api.actions.entityDocumentation.publishSecurityToConfluence);
    const publishAppDoc = useAction(api.actions.entityDocumentation.publishAppToConfluence);
    const publishWebResourceDoc = useAction(api.actions.entityDocumentation.publishWebResourceToConfluence);

    // Mutations
    const saveSecurityDoc = useMutation(api.documentation.saveSecurityDocumentation);
    const saveAppDoc = useMutation(api.documentation.saveAppDocumentation);
    const saveWebResourceDoc = useMutation(api.documentation.saveWebResourceDocumentation);
    const saveSettings = useMutation(api.documentation.saveConfluenceSettings);

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
    const [parentIdSetting, setParentIdSetting] = useState('');

    // Reset when entity changes
    const entityKey = docType === 'security' ? tenantId : docType === 'app' ? appId : webResourceId;
    useEffect(() => {
        setContent('');
        setIsEditing(false);
    }, [entityKey]);

    useEffect(() => {
        if (documentation) {
            setContent(documentation.content);
        } else if (documentation === null) {
            setContent('');
        }
    }, [documentation, entityKey]);

    useEffect(() => {
        if (settings) {
            setDomain(settings.domain);
            setEmail(settings.email);
            setApiToken(settings.apiToken);
            setSpaceKey(settings.spaceKey || '');
            setParentIdSetting(settings.parentId || '');
        }
    }, [settings]);

    const getTitle = () => {
        switch (docType) {
            case 'security': return 'Security Overview Documentation';
            case 'app': return appName ? `App Documentation: ${appName}` : 'App Documentation';
            case 'webresource': return webResourceName ? `Web Resource: ${webResourceName}` : 'Web Resource Documentation';
        }
    };

    const getConfluenceTitle = () => {
        switch (docType) {
            case 'security': return `🔒 Security Overview`;
            case 'app': return `📱 ${appName || 'App Documentation'}`;
            case 'webresource': return `💻 ${webResourceName || 'Web Resource'}`;
        }
    };

    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            let result: string;
            switch (docType) {
                case 'security':
                    result = await generateSecurityDoc({ tenantId });
                    break;
                case 'app':
                    if (!appId) throw new Error("No app selected");
                    result = await generateAppDoc({ appId, tenantId });
                    break;
                case 'webresource':
                    if (!webResourceId || !webResourceCode) throw new Error("No web resource or code available");
                    result = await generateWebResourceDoc({
                        webResourceId,
                        tenantId,
                        code: webResourceCode,
                        resourceName: webResourceName || 'Unknown',
                        resourceType: webResourceType || 'JavaScript',
                    });
                    break;
            }
            setContent(result);
            // Auto-save draft
            await handleSaveDraft(result);
            setIsEditing(true);
        } catch (error) {
            console.error("Failed to generate:", error);
            alert("Failed to generate documentation. Please try again.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSaveDraft = async (overrideContent?: string) => {
        const c = overrideContent || content;
        switch (docType) {
            case 'security':
                await saveSecurityDoc({ tenantId, content: c, status: 'draft' });
                break;
            case 'app':
                if (appId) await saveAppDoc({ appId, content: c, status: 'draft' });
                break;
            case 'webresource':
                if (webResourceId) await saveWebResourceDoc({ webResourceId, content: c, status: 'draft' });
                break;
        }
        setIsEditing(false);
    };

    const handleSaveSettings = async () => {
        await saveSettings({ domain, email, apiToken, spaceKey, parentId: parentIdSetting });
        setShowSettings(false);
    };

    const handlePublish = async () => {
        if (!settings || !settings.spaceKey) {
            setShowSettings(true);
            return;
        }
        setIsPublishing(true);
        try {
            switch (docType) {
                case 'security':
                    await publishSecurityDoc({
                        tenantId,
                        title: getConfluenceTitle(),
                        content,
                        parentPageId: selectedParentPage?.id,
                    });
                    break;
                case 'app':
                    if (!appId) throw new Error("No app selected");
                    await publishAppDoc({
                        appId,
                        title: getConfluenceTitle(),
                        content,
                        parentPageId: selectedParentPage?.id,
                    });
                    break;
                case 'webresource':
                    if (!webResourceId) throw new Error("No web resource selected");
                    await publishWebResourceDoc({
                        webResourceId,
                        title: getConfluenceTitle(),
                        content,
                        parentPageId: selectedParentPage?.id,
                    });
                    break;
            }
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
                        <input type="text" placeholder="your-company.atlassian.net"
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            value={domain} onChange={e => setDomain(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
                        <input type="email" placeholder="you@company.com"
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            value={email} onChange={e => setEmail(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">API Token</label>
                        <input type="password" placeholder="Atlassian API Token"
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            value={apiToken} onChange={e => setApiToken(e.target.value)} />
                        <p className="text-[10px] text-slate-400 mt-1">Get a token from <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" className="text-indigo-500 underline" rel="noreferrer">Atlassian Security Settings</a></p>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Space Key</label>
                        <input type="text" placeholder="e.g. ENG, PROD, KB"
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            value={spaceKey} onChange={e => setSpaceKey(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Parent Page ID (Optional)</label>
                        <input type="text" placeholder="e.g. 12345678"
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            value={parentIdSetting} onChange={e => setParentIdSetting(e.target.value)} />
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-8">
                    <button onClick={() => setShowSettings(false)}
                        className="px-4 py-2 text-slate-500 font-medium text-sm hover:text-slate-700">Cancel</button>
                    <button onClick={handleSaveSettings}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium text-sm hover:bg-indigo-700 transition">Save Configuration</button>
                </div>
            </div>
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
                    Generate a comprehensive {getTitle().toLowerCase()} using Claude AI.
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
                        <button onClick={() => handleSaveDraft()}
                            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition">
                            <Save size={14} /> Save Draft
                        </button>
                    ) : (
                        <button onClick={() => setIsEditing(true)}
                            className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition">
                            Edit
                        </button>
                    )}

                    {!isEditing && documentation && (
                        <button onClick={handleGenerate} disabled={isGenerating}
                            className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition"
                            title="Regenerate documentation">
                            <RefreshCw size={14} className={isGenerating ? "animate-spin" : ""} />
                            Regenerate
                        </button>
                    )}

                    <div className="h-4 w-px bg-slate-300 mx-1" />

                    <button onClick={() => setShowSettings(true)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                        title="Confluence Settings">
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

                    <button onClick={handlePublish} disabled={isPublishing || isEditing}
                        className="flex items-center gap-2 px-4 py-1.5 bg-sky-600 text-white rounded-lg text-sm font-bold hover:bg-sky-700 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
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
                        <ReactMarkdown>{content}</ReactMarkdown>
                    </div>
                )}
            </div>

            {/* Footer */}
            {!isEditing && (
                <div className="border-t border-slate-100 p-3 bg-slate-50 text-[10px] text-slate-400 text-center flex justify-center gap-4">
                    <span>Generated by Claude AI</span>
                    {documentation?.confluenceUrl && (
                        <a href={documentation.confluenceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sky-600 hover:underline">
                            <Globe size={10} /> View in Confluence
                        </a>
                    )}
                </div>
            )}
        </div>
    );
}
