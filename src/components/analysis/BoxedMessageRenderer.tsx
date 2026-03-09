"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Sparkles, Quote } from "lucide-react";
import ReactMarkdown from "react-markdown";

function formatInlineCode(text: string): string {
    if (typeof text !== 'string') return text;
    if (text.startsWith('likert_') || text.startsWith('binary_') || text.startsWith('category_')) {
        return text
            .replace(/^(likert_|binary_|category_)/, '') // Strip prefix
            .replace(/_+/g, ' ') // Replace underscores with spaces
            .trim();
    }
    return text;
}

export function BoxedMessageRenderer({ content }: { content: string }) {
    // Regex for <box title="...">...</box>
    const boxRegex = /<box title="([^"]+)">([\s\S]*?)<\/box>/g;
    const parts: { type: 'text' | 'box', title?: string, content: string }[] = [];
    let lastIndex = 0;
    let match;

    while ((match = boxRegex.exec(content)) !== null) {
        if (match.index > lastIndex) {
            parts.push({ type: 'text', content: content.slice(lastIndex, match.index) });
        }
        parts.push({ type: 'box', title: match[1], content: match[2] });
        lastIndex = boxRegex.lastIndex;
    }

    if (lastIndex < content.length) {
        parts.push({ type: 'text', content: content.slice(lastIndex) });
    }

    // Default markdown if no boxes
    if (parts.length === 0) {
        return (
            <div className="prose prose-slate prose-indigo dark:prose-invert max-w-none 
                prose-p:leading-relaxed prose-headings:font-black prose-headings:tracking-tighter prose-headings:text-indigo-600 dark:prose-headings:text-indigo-400
                prose-blockquote:border-l-4 prose-blockquote:border-l-indigo-500 prose-blockquote:bg-indigo-50/20 dark:prose-blockquote:bg-indigo-900/10 
                prose-blockquote:rounded-r-2xl prose-blockquote:px-8 prose-blockquote:py-2
                prose-strong:text-indigo-700 dark:prose-strong:text-indigo-300
                prose-code:text-pink-600 dark:prose-code:text-pink-400 prose-code:font-mono
                prose-em:text-blue-600 dark:prose-em:text-blue-400 prose-em:font-bold prose-em:not-italic">
                <ReactMarkdown
                    components={{
                        code: ({ node, children, className, ...props }: any) => {
                            const text = String(children).replace(/\n$/, '');
                            return (
                                <code className="bg-slate-100 dark:bg-slate-800/80 text-pink-600 dark:text-pink-400 px-1.5 py-0.5 rounded text-[13px] font-mono font-semibold border border-slate-200 dark:border-slate-700/50" {...props}>
                                    {formatInlineCode(text)}
                                </code>
                            );
                        },
                        em: ({ node, children, ...props }: any) => {
                            const text = String(children);
                            if (text.toLowerCase().includes('segment')) {
                                return <em className="text-cyan-600 dark:text-cyan-400 font-bold not-italic bg-cyan-50 dark:bg-cyan-900/40 px-1.5 py-0.5 rounded-md border border-cyan-100 dark:border-cyan-800/50" {...props}>{children}</em>;
                            }
                            return <em className="text-blue-600 dark:text-blue-400 font-bold not-italic" {...props}>{children}</em>;
                        },
                        strong: ({ node, children, ...props }: any) => {
                            const text = String(children);
                            if (/^[\d.,%]+$/.test(text)) {
                                return <strong className="text-amber-600 dark:text-amber-400 font-black bg-amber-50 dark:bg-amber-900/40 px-1.5 py-0.5 rounded-md border border-amber-100 dark:border-amber-800/50" {...props}>{children}</strong>;
                            }
                            return <strong className="text-indigo-700 dark:text-indigo-300 font-bold" {...props}>{children}</strong>;
                        }
                    }}
                >
                    {content}
                </ReactMarkdown>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {parts.map((part, i) => (
                part.type === 'box' ? (
                    <div key={i} className="bg-slate-50/50 dark:bg-slate-900/70 border border-slate-200/50 dark:border-slate-800 rounded-[2rem] p-8 relative overflow-hidden group hover:shadow-2xl hover:shadow-indigo-500/5 transition-all duration-500 my-6">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700 pointer-events-none" />
                        <h4 className="text-sm font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-3 relative z-10">
                            <Sparkles className="w-5 h-5 text-amber-500" /> {part.title}
                        </h4>
                        <div className="prose prose-indigo dark:prose-invert max-w-none text-[15px] leading-relaxed relative z-10">
                            <ReactMarkdown
                                components={{
                                    blockquote: ({ node, ...props }) => (
                                        <div className="text-[14px] text-indigo-700/80 dark:text-indigo-400/80 italic flex items-start gap-4 bg-white dark:bg-black/20 p-5 rounded-2xl border border-indigo-100/50 dark:border-indigo-900/50 shadow-sm my-5">
                                            <Quote className="w-4 h-4 mt-1.5 shrink-0 text-indigo-300" />
                                            <span className="leading-relaxed" {...props} />
                                        </div>
                                    ),
                                    h3: ({ node, ...props }) => (
                                        <h3 className="text-base font-black text-slate-800 dark:text-slate-200 mt-8 mb-4 border-b border-indigo-100 dark:border-indigo-900/50 pb-2" {...props} />
                                    ),
                                    h4: ({ node, ...props }) => (
                                        <h4 className="text-xs font-black text-indigo-500 uppercase tracking-widest mb-3 mt-8 first:mt-0 flex items-center gap-2" {...props} />
                                    ),
                                    strong: ({ node, children, ...props }: any) => {
                                        const text = String(children);
                                        if (/^[\d.,%]+$/.test(text)) {
                                            return <strong className="text-amber-600 dark:text-amber-400 font-black bg-amber-50 dark:bg-amber-900/40 px-1.5 py-0.5 rounded-md border border-amber-100 dark:border-amber-800/50" {...props}>{children}</strong>;
                                        }
                                        return <strong className="text-indigo-900 dark:text-indigo-300 font-black" {...props}>{children}</strong>;
                                    },
                                    code: ({ node, children, className, ...props }: any) => {
                                        const text = String(children).replace(/\n$/, '');
                                        return (
                                            <code className="bg-white dark:bg-slate-800 text-pink-600 dark:text-pink-400 px-1.5 py-0.5 rounded text-[13px] font-mono font-semibold border border-slate-200 dark:border-slate-700/50 shadow-sm" {...props}>
                                                {formatInlineCode(text)}
                                            </code>
                                        );
                                    },
                                    em: ({ node, children, ...props }: any) => {
                                        const text = String(children);
                                        if (text.toLowerCase().includes('segment')) {
                                            return <em className="text-cyan-600 dark:text-cyan-400 font-bold not-italic bg-cyan-50 dark:bg-cyan-900/40 px-1.5 py-0.5 rounded-md border border-cyan-100 dark:border-cyan-800/50" {...props}>{children}</em>;
                                        }
                                        return <em className="text-blue-600 dark:text-blue-400 font-bold not-italic" {...props}>{children}</em>;
                                    }
                                }}
                            >
                                {part.content}
                            </ReactMarkdown>
                        </div>
                    </div>
                ) : (
                    <div key={i} className="prose prose-slate prose-indigo dark:prose-invert max-w-none px-2
                        prose-p:leading-relaxed prose-headings:font-black prose-headings:tracking-tighter prose-headings:text-indigo-600 dark:prose-headings:text-indigo-400
                        prose-strong:text-indigo-700 dark:prose-strong:text-indigo-300
                        prose-code:text-pink-600 dark:prose-code:text-pink-400 prose-code:font-mono
                        prose-em:text-blue-600 dark:prose-em:text-blue-400 prose-em:font-bold prose-em:not-italic">
                        <ReactMarkdown
                            components={{
                                code: ({ node, children, className, ...props }: any) => {
                                    const text = String(children).replace(/\n$/, '');
                                    return (
                                        <code className="bg-slate-100 dark:bg-slate-800/80 text-pink-600 dark:text-pink-400 px-1.5 py-0.5 rounded text-[13px] font-mono font-semibold border border-slate-200 dark:border-slate-700/50" {...props}>
                                            {formatInlineCode(text)}
                                        </code>
                                    );
                                },
                                em: ({ node, children, ...props }: any) => {
                                    const text = String(children);
                                    if (text.toLowerCase().includes('segment')) {
                                        return <em className="text-cyan-600 dark:text-cyan-400 font-bold not-italic bg-cyan-50 dark:bg-cyan-900/40 px-1.5 py-0.5 rounded-md border border-cyan-100 dark:border-cyan-800/50" {...props}>{children}</em>;
                                    }
                                    return <em className="text-blue-600 dark:text-blue-400 font-bold not-italic" {...props}>{children}</em>;
                                },
                                strong: ({ node, children, ...props }: any) => {
                                    const text = String(children);
                                    if (/^[\d.,%]+$/.test(text)) {
                                        return <strong className="text-amber-600 dark:text-amber-400 font-black bg-amber-50 dark:bg-amber-900/40 px-1.5 py-0.5 rounded-md border border-amber-100 dark:border-amber-800/50" {...props}>{children}</strong>;
                                    }
                                    return <strong className="text-indigo-700 dark:text-indigo-300 font-bold" {...props}>{children}</strong>;
                                }
                            }}
                        >
                            {part.content}
                        </ReactMarkdown>
                    </div>
                )
            ))}
        </div>
    );
}
