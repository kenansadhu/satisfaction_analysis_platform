"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Send, Sparkles, Bot, User, CornerDownRight } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

type Message = {
    id: string;
    role: "user" | "assistant";
    content: string;
};

export default function UnitInsightChat({ unitId, surveyId }: { unitId: string; surveyId?: string }) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMsg: Message = { id: Date.now().toString(), role: "user", content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput("");
        setIsLoading(true);

        try {
            const res = await fetch("/api/ai/chat-unit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    unitId,
                    surveyId,
                    history: messages,
                    prompt: userMsg.content
                }),
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || "Failed to fetch response");
            }

            const data = await res.json();

            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: data.reply
            }]);

        } catch (error: any) {
            toast.error(error.message || "Failed to connect to AI");
            // Remove the user message if it failed completely (optional, or just show error)
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card className="flex flex-col h-[500px] border-indigo-200 dark:border-indigo-900/50 shadow-lg bg-white dark:bg-slate-900 overflow-hidden print:hidden">
            <CardHeader className="bg-indigo-50/50 dark:bg-indigo-950/20 border-b border-indigo-100 dark:border-indigo-900/50 py-3">
                <CardTitle className="text-base font-semibold text-indigo-900 dark:text-indigo-300 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-500" />
                    Ask AI about your data
                </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-0 flex flex-col min-h-0">
                <ScrollArea className="flex-1 p-4 w-full h-full" ref={scrollRef}>
                    {messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 space-y-3 opacity-60 mt-12">
                            <Bot className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-2" />
                            <p className="text-sm max-w-[250px]">Ask me anything about this unit's metrics, sentiment, or specific feedback.</p>
                            <div className="flex flex-wrap gap-2 justify-center max-w-[400px]">
                                <Badge className="cursor-pointer hover:bg-slate-200" onClick={() => setInput("What are the main complaints?")} variant="secondary">What are the main complaints?</Badge>
                                <Badge className="cursor-pointer hover:bg-slate-200" onClick={() => setInput("Summarize the positive feedback")} variant="secondary">Summarize the positive feedback</Badge>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4 pb-4">
                            {messages.map((msg) => (
                                <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    {msg.role === 'assistant' && (
                                        <div className="w-8 h-8 rounded bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center shrink-0">
                                            <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                        </div>
                                    )}
                                    <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${msg.role === 'user'
                                        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-tr-sm'
                                        : 'bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-tl-sm'
                                        }`}>
                                        {msg.role === 'assistant' ? (
                                            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-slate-900">
                                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                                            </div>
                                        ) : (
                                            msg.content
                                        )}
                                    </div>
                                    {msg.role === 'user' && (
                                        <div className="w-8 h-8 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                                            <User className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                                        </div>
                                    )}
                                </div>
                            ))}
                            {isLoading && (
                                <div className="flex gap-3 justify-start">
                                    <div className="w-8 h-8 rounded bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center shrink-0">
                                        <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 animate-pulse" />
                                    </div>
                                    <div className="bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl rounded-tl-sm px-4 py-3 text-sm flex items-center gap-2">
                                        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                                        <span className="text-slate-500 animate-pulse">Thinking...</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </ScrollArea>
            </CardContent>

            <CardFooter className="p-3 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10">
                <form
                    onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                    className="flex w-full items-end gap-2"
                >
                    <Input
                        placeholder="Ask about the data..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        className="flex-1 border border-slate-200 dark:border-slate-700 focus-visible:ring-1 focus-visible:ring-indigo-500 bg-transparent px-3"
                        disabled={isLoading}
                    />
                    <Button
                        type="submit"
                        size="icon"
                        disabled={!input.trim() || isLoading}
                        className="h-9 w-9 shrink-0 bg-indigo-600 hover:bg-indigo-700 rounded-md"
                    >
                        <CornerDownRight className="w-4 h-4" />
                    </Button>
                </form>
            </CardFooter>
        </Card>
    );
}
// Helper component for suggestions
function Badge({ children, onClick, className }: { children: React.ReactNode, onClick: () => void, variant?: string, className?: string }) {
    return (
        <div
            onClick={onClick}
            className={`px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${className}`}
        >
            {children}
        </div>
    );
}

