"use client";

import React from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
    children: React.ReactNode;
    fallbackTitle?: string;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("🔴 ErrorBoundary caught:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center py-16 px-8 text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
                        <AlertTriangle className="w-8 h-8 text-red-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-800">
                        {this.props.fallbackTitle || "Something went wrong"}
                    </h3>
                    <p className="text-sm text-slate-500 max-w-md">
                        {this.state.error?.message || "An unexpected error occurred in this component."}
                    </p>
                    <Button
                        variant="outline"
                        className="gap-2 mt-2"
                        onClick={() => this.setState({ hasError: false, error: null })}
                    >
                        <RefreshCcw className="w-4 h-4" /> Try Again
                    </Button>
                </div>
            );
        }

        return this.props.children;
    }
}
