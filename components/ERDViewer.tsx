import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useAction } from "convex/react";
// @ts-ignore TS2589 type depth limit with large Convex schema
import { api } from '@/convex/_generated/api';
import {
    GitBranch,
    RefreshCw,
    Send,
    Save,
    Loader2,
    Globe,
    Settings,
    Edit3,
    Eye,
    Download,
    Copy,
    Check,
    AlertCircle,
    ZoomIn,
    ZoomOut,
    Maximize2
} from 'lucide-react';
import ConfluencePagePicker, { ConfluencePageSelection } from './ConfluencePagePicker';

interface ERDViewerProps {
    tenantId: string;
    appModuleId: string;
    appName: string;
    orgId?: string;
}

export default function ERDViewer({ tenantId, appModuleId, appName, orgId }: ERDViewerProps) {
    // @ts-ignore TS2589 type depth limit with large Convex schema
    const erdDiagram = useQuery(api.queries.getErdDiagram, { tenantId, appModuleId });
    const generateErd = useAction(api.actions.erd.generateErd);
    const publishErd = useAction(api.actions.erd.publishErdToConfluence);
    const saveErd = useMutation(api.mutations.saveErdDiagram);

    const [mermaidCode, setMermaidCode] = useState('');
    const [renderedSvg, setRenderedSvg] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [renderError, setRenderError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [selectedParentPage, setSelectedParentPage] = useState<ConfluencePageSelection | null>(null);
    const confluenceSettings = useQuery((api as any).documentation.getConfluenceSettings, {});
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const panStart = useRef({ x: 0, y: 0 });

    const renderRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Load cached ERD
    useEffect(() => {
        if (erdDiagram?.mermaidCode) {
            setMermaidCode(erdDiagram.mermaidCode);
        }
    }, [erdDiagram]);

    // Render mermaid diagram
    const renderMermaid = useCallback(async (code: string) => {
        if (!code.trim()) {
            setRenderedSvg('');
            setRenderError(null);
            return;
        }

        try {
            const mermaid = (await import('mermaid')).default;
            mermaid.initialize({
                startOnLoad: false,
                theme: 'default',
                er: {
                    useMaxWidth: true,
                    layoutDirection: 'TB',
                },
                securityLevel: 'loose',
            });

            const id = `erd-${Date.now()}`;
            const { svg } = await mermaid.render(id, code);
            setRenderedSvg(svg);
            setRenderError(null);
        } catch (err: any) {
            console.error('[ERDViewer] Mermaid render error:', err);
            setRenderError(err.message || 'Failed to render diagram');
            setRenderedSvg('');
        }
    }, []);

    // Re-render when mermaid code changes (debounced when editing)
    useEffect(() => {
        if (!isEditing && mermaidCode) {
            renderMermaid(mermaidCode);
        }
    }, [mermaidCode, isEditing, renderMermaid]);

    // Reset state when app changes
    useEffect(() => {
        setMermaidCode('');
        setRenderedSvg('');
        setRenderError(null);
        setIsEditing(false);
        setZoom(1);
        setPan({ x: 0, y: 0 });
    }, [appModuleId]);

    const handleGenerate = async () => {
        setIsGenerating(true);
        setRenderError(null);
        try {
            const result = await generateErd({ tenantId, appModuleId, appName, orgId });
            setMermaidCode(result);
            setIsEditing(false);
            await renderMermaid(result);
        } catch (error: any) {
            console.error("ERD generation failed:", error);
            setRenderError(error.message || "Failed to generate ERD");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSave = async () => {
        await saveErd({
            tenantId,
            appModuleId,
            mermaidCode,
            status: 'draft',
        });
        setIsEditing(false);
        await renderMermaid(mermaidCode);
    };

    const handlePublish = async () => {
        setIsPublishing(true);
        try {
            const result = await publishErd({ tenantId, appModuleId, appName, mermaidCode, parentPageId: selectedParentPage?.id });
            if (result.url) {
                alert(`Published successfully! View at: ${result.url}`);
            }
        } catch (error: any) {
            console.error("Publish failed:", error);
            alert(error.message || "Failed to publish to Confluence");
        } finally {
            setIsPublishing(false);
        }
    };

    const handleCopy = async () => {
        await navigator.clipboard.writeText(mermaidCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownloadSvg = () => {
        if (!renderedSvg) return;
        const blob = new Blob([renderedSvg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'erd-diagram.svg';
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleZoomIn = () => setZoom(z => Math.min(z + 0.25, 5));
    const handleZoomOut = () => setZoom(z => Math.max(z - 0.25, 0.1));
    const handleZoomReset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setZoom(z => Math.min(Math.max(z + delta, 0.1), 5));
    }, []);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return; // left click only
        setIsPanning(true);
        panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }, [pan]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isPanning) return;
        setPan({
            x: e.clientX - panStart.current.x,
            y: e.clientY - panStart.current.y,
        });
    }, [isPanning]);

    const handleMouseUp = useCallback(() => {
        setIsPanning(false);
    }, []);

    // Reset zoom/pan when new diagram is rendered
    useEffect(() => {
        if (renderedSvg) {
            setZoom(1);
            setPan({ x: 0, y: 0 });
        }
    }, [renderedSvg]);

    // Empty state - no ERD generated yet
    if (!mermaidCode && !erdDiagram) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center bg-slate-50 rounded-2xl border border-slate-200 border-dashed">
                <div className="bg-white p-4 rounded-full shadow-sm mb-4">
                    <GitBranch size={32} className="text-indigo-400" />
                </div>
                <h3 className="font-bold text-slate-800 mb-1">No ERD Generated Yet</h3>
                <p className="text-slate-500 text-sm max-w-sm mb-6">
                    Generate an Entity Relationship Diagram showing all tables and their relationships from your solution.
                </p>
                <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-700 disabled:opacity-50 shadow-md shadow-indigo-500/20 active:scale-95 transition-all"
                >
                    {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <GitBranch size={18} />}
                    {isGenerating ? 'Generating ERD...' : 'Generate ERD'}
                </button>
            </div>
        );
    }

    if (erdDiagram === undefined) {
        return (
            <div className="p-8 text-center">
                <Loader2 className="animate-spin inline text-indigo-500" />
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 160px)' }}>
            {/* Toolbar */}
            <div className="border-b border-slate-100 p-3 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 rounded-lg text-xs font-semibold text-indigo-600">
                        <GitBranch size={14} />
                        ERD
                    </div>
                    {erdDiagram?.lastGenerated && (
                        <span className="text-[10px] text-slate-400">
                            Generated: {new Date(erdDiagram.lastGenerated).toLocaleString()}
                        </span>
                    )}
                    {erdDiagram?.status === 'published' && (
                        <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded font-medium">Published</span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {isEditing ? (
                        <button
                            onClick={handleSave}
                            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition"
                        >
                            <Save size={14} />
                            Save
                        </button>
                    ) : (
                        <button
                            onClick={() => setIsEditing(true)}
                            className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition"
                        >
                            <Edit3 size={14} />
                            Edit
                        </button>
                    )}

                    {!isEditing && (
                        <>
                            <button
                                onClick={handleGenerate}
                                disabled={isGenerating}
                                className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition"
                                title="Regenerate ERD from D365"
                            >
                                <RefreshCw size={14} className={isGenerating ? "animate-spin" : ""} />
                                Regenerate
                            </button>

                            <button
                                onClick={handleCopy}
                                className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition"
                                title="Copy Mermaid code"
                            >
                                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                                {copied ? 'Copied' : 'Copy'}
                            </button>

                            <button
                                onClick={handleDownloadSvg}
                                disabled={!renderedSvg}
                                className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition disabled:opacity-50"
                                title="Download as SVG"
                            >
                                <Download size={14} />
                                SVG
                            </button>
                        </>
                    )}

                    <div className="h-4 w-px bg-slate-300 mx-1" />

                    {confluenceSettings?.spaceKey && !isEditing && (
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
                        disabled={isPublishing || isEditing || !mermaidCode}
                        className="flex items-center gap-2 px-4 py-1.5 bg-sky-600 text-white rounded-lg text-sm font-bold hover:bg-sky-700 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isPublishing ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
                        Push to Confluence
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden relative">
                {isEditing ? (
                    <div className="h-full flex flex-col">
                        <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 flex items-center gap-2 text-xs text-amber-700">
                            <Edit3 size={12} />
                            Editing Mermaid code. Save to preview changes.
                        </div>
                        <textarea
                            className="w-full flex-1 p-4 outline-none resize-none font-mono text-sm text-slate-700 bg-slate-50/30"
                            value={mermaidCode}
                            onChange={(e) => setMermaidCode(e.target.value)}
                            placeholder="erDiagram&#10;    Table1 ||--o{ Table2 : &quot;&quot;&#10;    ..."
                            spellCheck={false}
                        />
                    </div>
                ) : (
                    <>
                        {/* Zoom controls overlay */}
                        <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-white/90 backdrop-blur-sm rounded-lg border border-slate-200 shadow-sm p-1">
                            <button
                                onClick={handleZoomOut}
                                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition"
                                title="Zoom out"
                            >
                                <ZoomOut size={16} />
                            </button>
                            <span className="text-[11px] font-mono text-slate-500 w-12 text-center select-none">
                                {Math.round(zoom * 100)}%
                            </span>
                            <button
                                onClick={handleZoomIn}
                                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition"
                                title="Zoom in"
                            >
                                <ZoomIn size={16} />
                            </button>
                            <div className="w-px h-4 bg-slate-200 mx-0.5" />
                            <button
                                onClick={handleZoomReset}
                                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition"
                                title="Reset zoom & position"
                            >
                                <Maximize2 size={16} />
                            </button>
                        </div>

                        {/* Diagram canvas with pan & zoom */}
                        <div
                            ref={containerRef}
                            className="h-full overflow-hidden"
                            onWheel={handleWheel}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                            style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
                        >
                            {renderError ? (
                                <div className="p-8 text-center">
                                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 rounded-lg text-sm mb-4">
                                        <AlertCircle size={16} />
                                        {renderError}
                                    </div>
                                    <p className="text-slate-400 text-xs mt-2">Try editing the Mermaid code to fix syntax errors.</p>
                                </div>
                            ) : renderedSvg ? (
                                <div
                                    ref={renderRef}
                                    className="p-6 origin-top-left inline-block min-w-full"
                                    style={{
                                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                                        transformOrigin: 'top left',
                                    }}
                                    dangerouslySetInnerHTML={{ __html: renderedSvg }}
                                />
                            ) : (
                                <div className="p-8 text-center text-slate-400">
                                    <Loader2 className="animate-spin inline" size={20} />
                                    <p className="text-xs mt-2">Rendering diagram...</p>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Footer */}
            {!isEditing && (
                <div className="border-t border-slate-100 p-3 bg-slate-50 text-[10px] text-slate-400 text-center flex justify-center gap-4">
                    <span>Generated from D365 Solution Relationships</span>
                    {erdDiagram?.confluenceUrl && (
                        <a href={erdDiagram.confluenceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sky-600 hover:underline">
                            <Globe size={10} />
                            View in Confluence
                        </a>
                    )}
                </div>
            )}
        </div>
    );
}
