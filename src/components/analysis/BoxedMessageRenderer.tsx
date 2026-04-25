"use client";

import { Sparkles, Quote } from "lucide-react";
import ReactMarkdown from "react-markdown";

// Cool-neutral tones only — no green/amber/red which imply positive/negative sentiment
const BOX_THEMES = [
    {
        bg: "bg-slate-50/60 dark:bg-slate-900/50",
        border: "border-slate-200/70 dark:border-slate-700/50",
        titleColor: "text-indigo-600 dark:text-indigo-400",
        iconColor: "text-amber-500",
        accentBg: "bg-indigo-500/5",
        quoteBorderSide: "border-l-4 border-indigo-300 dark:border-indigo-700",
        quoteBorderAll: "border border-indigo-100/60 dark:border-indigo-900/50",
        quoteBg: "bg-white dark:bg-black/20",
        quoteText: "text-indigo-800/80 dark:text-indigo-300/80",
        quoteIcon: "text-indigo-300",
        h4Color: "text-indigo-500 dark:text-indigo-400",
    },
    {
        bg: "bg-sky-50/40 dark:bg-sky-950/20",
        border: "border-sky-200/60 dark:border-sky-800/40",
        titleColor: "text-sky-600 dark:text-sky-400",
        iconColor: "text-sky-400",
        accentBg: "bg-sky-500/5",
        quoteBorderSide: "border-l-4 border-sky-300 dark:border-sky-700",
        quoteBorderAll: "border border-sky-100/60 dark:border-sky-900/50",
        quoteBg: "bg-white dark:bg-black/20",
        quoteText: "text-sky-800/80 dark:text-sky-300/80",
        quoteIcon: "text-sky-300",
        h4Color: "text-sky-600 dark:text-sky-400",
    },
    {
        bg: "bg-violet-50/30 dark:bg-violet-950/20",
        border: "border-violet-200/60 dark:border-violet-800/40",
        titleColor: "text-violet-600 dark:text-violet-400",
        iconColor: "text-violet-400",
        accentBg: "bg-violet-500/5",
        quoteBorderSide: "border-l-4 border-violet-300 dark:border-violet-700",
        quoteBorderAll: "border border-violet-100/60 dark:border-violet-900/50",
        quoteBg: "bg-white dark:bg-black/20",
        quoteText: "text-violet-800/80 dark:text-violet-300/80",
        quoteIcon: "text-violet-300",
        h4Color: "text-violet-500 dark:text-violet-400",
    },
    {
        bg: "bg-indigo-50/30 dark:bg-indigo-950/20",
        border: "border-indigo-200/60 dark:border-indigo-800/40",
        titleColor: "text-indigo-700 dark:text-indigo-300",
        iconColor: "text-indigo-400",
        accentBg: "bg-indigo-500/5",
        quoteBorderSide: "border-l-4 border-indigo-300 dark:border-indigo-700",
        quoteBorderAll: "border border-indigo-100/60 dark:border-indigo-900/50",
        quoteBg: "bg-white dark:bg-black/20",
        quoteText: "text-indigo-800/80 dark:text-indigo-300/80",
        quoteIcon: "text-indigo-300",
        h4Color: "text-indigo-500 dark:text-indigo-400",
    },
    {
        bg: "bg-cyan-50/30 dark:bg-cyan-950/20",
        border: "border-cyan-200/60 dark:border-cyan-800/40",
        titleColor: "text-cyan-700 dark:text-cyan-400",
        iconColor: "text-cyan-400",
        accentBg: "bg-cyan-500/5",
        quoteBorderSide: "border-l-4 border-cyan-300 dark:border-cyan-700",
        quoteBorderAll: "border border-cyan-100/60 dark:border-cyan-900/50",
        quoteBg: "bg-white dark:bg-black/20",
        quoteText: "text-cyan-800/80 dark:text-cyan-300/80",
        quoteIcon: "text-cyan-300",
        h4Color: "text-cyan-600 dark:text-cyan-400",
    },
];

type BoxTheme = typeof BOX_THEMES[0];

function extractNodeText(n: any): string {
    if (!n) return '';
    if (typeof n.value === 'string') return n.value;
    if (Array.isArray(n.children)) return n.children.map(extractNodeText).join('');
    return '';
}

function formatInlineCode(text: string): string {
    if (typeof text !== 'string') return text;
    if (text.startsWith('likert_') || text.startsWith('binary_') || text.startsWith('category_')) {
        return text.replace(/^(likert_|binary_|category_)/, '').replace(/_+/g, ' ').trim();
    }
    return text;
}

function buildComponents(theme?: BoxTheme) {
    return {
        p: ({ node, ...props }: any) => (
            <p className="mb-4 last:mb-0 leading-relaxed" {...props} />
        ),
        ul: ({ node, ordered, ...props }: any) => (
            <ul className="list-disc pl-5 space-y-1.5 my-3" {...props} />
        ),
        ol: ({ node, ordered, ...props }: any) => (
            <ol className="list-decimal pl-5 space-y-1.5 my-3" {...props} />
        ),
        li: ({ node, ordered, children, ...props }: any) => {
            const rawText = extractNodeText(node);
            const isVerbatim = /^[""]/.test(rawText.trim()) && /fakult|faculty|jurusan/i.test(rawText);
            if (isVerbatim) {
                // Split into quote body and faculty attribution
                const attrMatch = rawText.match(/^([\s\S]*)\s*(\([^)]+\))\s*$/);
                const quotePart = attrMatch ? attrMatch[1].trim() : rawText.trim();
                const attrRaw = attrMatch ? attrMatch[2] : '';
                const facultyMatch = attrRaw.match(/fakult[^)]*/i);
                const facultyName = facultyMatch ? facultyMatch[0].trim() : '';
                const attribution = facultyName ? `student of ${facultyName}` : attrRaw.replace(/[()]/g, '').trim();
                return (
                    <li className="list-none -ml-5 my-2">
                        <div className={`text-[14px] flex items-start gap-3 p-4 rounded-2xl shadow-sm ${theme
                            ? `${theme.quoteBorderSide} ${theme.quoteBorderAll} ${theme.quoteBg} ${theme.quoteText}`
                            : 'border-l-4 border-indigo-300 dark:border-indigo-700 border border-indigo-100/60 dark:border-indigo-900/50 bg-white dark:bg-black/20 text-indigo-800/80 dark:text-indigo-300/80'
                        }`}>
                            <Quote className={`w-4 h-4 mt-1 shrink-0 ${theme ? theme.quoteIcon : 'text-indigo-300'}`} />
                            <span className="leading-relaxed">
                                <span className="italic">{quotePart}</span>
                                {attribution && (
                                    <span className="not-italic block mt-1 text-[12px] opacity-60 font-medium">({attribution})</span>
                                )}
                            </span>
                        </div>
                    </li>
                );
            }
            return <li className="leading-relaxed" {...props}>{children}</li>;
        },
        blockquote: ({ node, ...props }: any) => {
            const rawText = extractNodeText(node);
            // Only flag as report reference when extraction succeeded and no faculty attribution found.
            // Default to verbatim (safe fallback) when extraction returns empty.
            const isReportRef = rawText.length > 0 && !/fakult|faculty|jurusan/i.test(rawText);

            if (!isReportRef) {
                const attrMatch = rawText.match(/^([\s\S]*)\s*(\([^)]+\))\s*$/);
                const quotePart = attrMatch ? attrMatch[1].trim() : rawText.trim();
                const attrRaw = attrMatch ? attrMatch[2] : '';
                const facultyMatch = attrRaw.match(/fakult[^)]*/i);
                const facultyName = facultyMatch ? facultyMatch[0].trim() : '';
                const attribution = facultyName ? `student of ${facultyName}` : attrRaw.replace(/[()]/g, '').trim();
                return (
                    <div className={`text-[14px] flex items-start gap-4 p-5 rounded-2xl shadow-sm my-5 ${theme
                        ? `${theme.quoteBorderSide} ${theme.quoteBorderAll} ${theme.quoteBg} ${theme.quoteText}`
                        : 'border-l-4 border-indigo-300 dark:border-indigo-700 border border-indigo-100/60 dark:border-indigo-900/50 bg-white dark:bg-black/20 text-indigo-800/80 dark:text-indigo-300/80'
                    }`}>
                        <Quote className={`w-5 h-5 mt-1 shrink-0 ${theme ? theme.quoteIcon : 'text-indigo-300'}`} />
                        <span className="leading-relaxed">
                            <span className="italic">{quotePart || <span {...props} />}</span>
                            {attribution && (
                                <span className="not-italic block mt-1 text-[12px] opacity-60 font-medium">({attribution})</span>
                            )}
                        </span>
                    </div>
                );
            }
            // Report reference (concern/category name) → neutral annotation tag
            return (
                <div className="flex items-center gap-2 px-3 py-1.5 my-3 max-w-fit bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-[13px] font-semibold text-slate-600 dark:text-slate-300 not-italic">
                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 shrink-0">↗</span>
                    <span {...props} />
                </div>
            );
        },
        h3: ({ node, ...props }: any) => (
            <h3 className="text-base font-black text-slate-800 dark:text-slate-200 mt-8 mb-3 border-b border-slate-100 dark:border-slate-800 pb-2" {...props} />
        ),
        h4: ({ node, ...props }: any) => (
            <h4 className={`text-xs font-black uppercase tracking-widest mb-3 mt-7 flex items-center gap-2 ${theme ? theme.h4Color : 'text-indigo-500 dark:text-indigo-400'}`} {...props} />
        ),
        strong: ({ node, children, ...props }: any) => {
            const text = String(children);
            // Strategic Analysis cross-reference → small gray chip
            if (/^strategic overview/i.test(text)) {
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wide mr-1.5">
                        ↗ Report
                    </span>
                );
            }
            // Section label separators (Verbatim Feedback, Quantitative Metric, Evidence, etc.)
            if (/^(verbatim feedback|qualitative verbatim|quantitative metric|evidence|top concern)/i.test(text)) {
                return (
                    <span className="inline-block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-4 mb-1 border-b border-slate-200 dark:border-slate-700 pb-0.5">
                        {children}
                    </span>
                );
            }
            // Numbers → amber highlight
            if (/^[\d.,%]+$/.test(text)) {
                return <strong className="text-amber-600 dark:text-amber-400 font-black bg-amber-50 dark:bg-amber-900/40 px-1.5 py-0.5 rounded-md border border-amber-100 dark:border-amber-800/50" {...props}>{children}</strong>;
            }
            return <strong className="text-indigo-900 dark:text-indigo-300 font-black" {...props}>{children}</strong>;
        },
        code: ({ node, children, className, ...props }: any) => {
            const text = String(children).replace(/\n$/, '');
            // Technical identifiers → format and show as pink mono
            if (text.startsWith('likert_') || text.startsWith('binary_') || text.startsWith('category_')) {
                return (
                    <code className="bg-white dark:bg-slate-800 text-pink-600 dark:text-pink-400 px-1.5 py-0.5 rounded text-[13px] font-mono font-semibold border border-slate-200 dark:border-slate-700/50 shadow-sm" {...props}>
                        {formatInlineCode(text)}
                    </code>
                );
            }
            // Multi-word text in backticks (e.g. concern/category names) → neutral label
            if (text.includes(' ')) {
                return (
                    <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-[13px] font-semibold text-slate-600 dark:text-slate-400">
                        {text}
                    </span>
                );
            }
            return (
                <code className="bg-white dark:bg-slate-800 text-pink-600 dark:text-pink-400 px-1.5 py-0.5 rounded text-[13px] font-mono font-semibold border border-slate-200 dark:border-slate-700/50 shadow-sm" {...props}>
                    {text}
                </code>
            );
        },
        em: ({ node, children, ...props }: any) => {
            const text = String(children);
            if (text.toLowerCase().includes('segment')) {
                return <em className="text-cyan-600 dark:text-cyan-400 font-bold not-italic bg-cyan-50 dark:bg-cyan-900/40 px-1.5 py-0.5 rounded-md border border-cyan-100 dark:border-cyan-800/50" {...props}>{children}</em>;
            }
            // Faculty / department / school name highlighting
            const isFacultyName = /faculty|department|school|college|programme|program|division|fakultas/i.test(text)
                || (text.trim().length > 3 && text.trim() === text.trim().toUpperCase() && /^[A-Z\s&,]+$/.test(text.trim()));
            if (isFacultyName) {
                return <em className="text-violet-700 dark:text-violet-400 font-black not-italic bg-violet-50 dark:bg-violet-900/30 px-2 py-0.5 rounded-md border border-violet-100 dark:border-violet-800/50" {...props}>{children}</em>;
            }
            return <em className="text-blue-600 dark:text-blue-400 font-bold not-italic" {...props}>{children}</em>;
        },
    };
}

export function BoxedMessageRenderer({ content }: { content: string }) {
    const boxRegex = /<box title="([^"]+)">([\s\S]*?)<\/box>/g;
    const parts: { type: 'text' | 'box'; title?: string; content: string }[] = [];
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

    if (parts.length === 0) {
        return (
            <div className="prose prose-slate prose-indigo dark:prose-invert max-w-none
                prose-p:leading-relaxed prose-p:mb-4
                prose-headings:font-black prose-headings:tracking-tighter prose-headings:text-indigo-600 dark:prose-headings:text-indigo-400
                prose-blockquote:border-l-4 prose-blockquote:border-l-indigo-500 prose-blockquote:bg-indigo-50/20 dark:prose-blockquote:bg-indigo-900/10
                prose-blockquote:rounded-r-2xl prose-blockquote:px-8 prose-blockquote:py-2
                prose-strong:text-indigo-700 dark:prose-strong:text-indigo-300
                prose-code:text-pink-600 dark:prose-code:text-pink-400 prose-code:font-mono
                prose-em:text-blue-600 dark:prose-em:text-blue-400 prose-em:font-bold prose-em:not-italic">
                <ReactMarkdown components={buildComponents()}>{content}</ReactMarkdown>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {parts.map((part, i) => {
                if (part.type === 'box') {
                    const boxIdx = parts.slice(0, i).filter(p => p.type === 'box').length;
                    const theme = BOX_THEMES[boxIdx % BOX_THEMES.length];
                    return (
                        <div key={i} className={`${theme.bg} ${theme.border} border rounded-[2rem] p-8 relative overflow-hidden group hover:shadow-2xl hover:shadow-indigo-500/5 transition-all duration-500`}>
                            <div className={`absolute top-0 right-0 w-32 h-32 ${theme.accentBg} rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700 pointer-events-none`} />
                            <h4 className={`text-sm font-black uppercase tracking-[0.2em] mb-6 flex items-center gap-3 relative z-10 ${theme.titleColor}`}>
                                <Sparkles className={`w-4 h-4 shrink-0 ${theme.iconColor}`} /> {part.title}
                            </h4>
                            <div className="text-[15px] text-slate-700 dark:text-slate-300 relative z-10">
                                <ReactMarkdown components={buildComponents(theme)}>
                                    {part.content}
                                </ReactMarkdown>
                            </div>
                        </div>
                    );
                } else {
                    const text = part.content.trim();
                    if (!text) return null;
                    return (
                        <div key={i} className="prose prose-slate prose-indigo dark:prose-invert max-w-none px-2
                            prose-p:leading-relaxed prose-p:mb-4
                            prose-headings:font-black prose-headings:tracking-tighter prose-headings:text-indigo-600 dark:prose-headings:text-indigo-400
                            prose-strong:text-indigo-700 dark:prose-strong:text-indigo-300
                            prose-code:text-pink-600 dark:prose-code:text-pink-400 prose-code:font-mono
                            prose-em:text-blue-600 dark:prose-em:text-blue-400 prose-em:font-bold prose-em:not-italic">
                            <ReactMarkdown components={buildComponents()}>
                                {part.content}
                            </ReactMarkdown>
                        </div>
                    );
                }
            })}
        </div>
    );
}
