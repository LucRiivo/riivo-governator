'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAction } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Search, X, FileText, Loader2, ChevronDown, FolderOpen } from 'lucide-react';

export interface ConfluencePageSelection {
    id: string;
    title: string;
}

interface ConfluencePagePickerProps {
    selectedPage: ConfluencePageSelection | null;
    onSelectPage: (page: ConfluencePageSelection | null) => void;
    disabled?: boolean;
    label?: string;
}

export default function ConfluencePagePicker({
    selectedPage,
    onSelectPage,
    disabled = false,
    label = 'Parent page',
}: ConfluencePagePickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // @ts-expect-error Convex type depth limit with expanded schema
    const searchPages = useAction(api.actions.confluence.searchConfluencePages);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    // Close on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        }
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isOpen]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    // Search on query change (debounced)
    useEffect(() => {
        if (!isOpen) return;

        if (debounceRef.current) clearTimeout(debounceRef.current);

        debounceRef.current = setTimeout(async () => {
            setIsLoading(true);
            setError(null);
            try {
                const res = await searchPages({ query, limit: 15 });
                setResults(res);
            } catch (err: any) {
                setError(err.message || 'Search failed');
                setResults([]);
            } finally {
                setIsLoading(false);
            }
        }, 300);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [query, isOpen, searchPages]);

    const handleOpen = () => {
        if (disabled) return;
        setIsOpen(true);
        setQuery('');
        setError(null);
    };

    const handleSelect = (page: any) => {
        onSelectPage({ id: page.id, title: page.title });
        setIsOpen(false);
    };

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        onSelectPage(null);
    };

    return (
        <div ref={containerRef} className="relative">
            {/* Trigger button */}
            <div className="space-y-1">
                {label && (
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {label}
                    </label>
                )}
                <button
                    type="button"
                    onClick={handleOpen}
                    disabled={disabled}
                    className={`
                        flex items-center gap-2 w-full px-3 py-2 rounded-lg border text-sm text-left transition
                        ${disabled
                            ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                            : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700 cursor-pointer'
                        }
                    `}
                >
                    <FolderOpen size={14} className="text-slate-400 shrink-0" />
                    <span className="flex-1 truncate">
                        {selectedPage ? selectedPage.title : 'Default from settings'}
                    </span>
                    {selectedPage ? (
                        <X
                            size={14}
                            className="text-slate-400 hover:text-slate-600 shrink-0"
                            onClick={handleClear}
                        />
                    ) : (
                        <ChevronDown size={14} className="text-slate-400 shrink-0" />
                    )}
                </button>
            </div>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute z-50 mt-1 w-full min-w-[320px] bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden">
                    {/* Search input */}
                    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100">
                        <Search size={14} className="text-slate-400 shrink-0" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search Confluence pages..."
                            className="flex-1 text-sm outline-none placeholder:text-slate-400"
                        />
                        {isLoading && <Loader2 size={14} className="animate-spin text-slate-400" />}
                    </div>

                    {/* "Use default" option */}
                    <button
                        onClick={() => { onSelectPage(null); setIsOpen(false); }}
                        className="w-full px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-50 flex items-center gap-2 border-b border-slate-100"
                    >
                        <div className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center shrink-0">
                            <FolderOpen size={12} className="text-slate-400" />
                        </div>
                        <span className="italic">Use default from settings</span>
                    </button>

                    {/* Results */}
                    <div className="max-h-60 overflow-y-auto">
                        {error && (
                            <div className="px-3 py-3 text-xs text-red-600 bg-red-50">
                                {error}
                            </div>
                        )}

                        {!error && !isLoading && results.length === 0 && query && (
                            <div className="px-3 py-4 text-xs text-slate-400 text-center">
                                No pages found
                            </div>
                        )}

                        {results.map((page) => (
                            <button
                                key={page.id}
                                onClick={() => handleSelect(page)}
                                className={`
                                    w-full px-3 py-2 text-left hover:bg-violet-50 transition flex items-start gap-2
                                    ${selectedPage?.id === page.id ? 'bg-violet-50' : ''}
                                `}
                            >
                                <div className="w-5 h-5 rounded bg-sky-50 flex items-center justify-center shrink-0 mt-0.5">
                                    <FileText size={12} className="text-sky-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-700 truncate">{page.title}</p>
                                    {page.breadcrumb && (
                                        <p className="text-[10px] text-slate-400 truncate">{page.breadcrumb}</p>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
