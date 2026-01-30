"use client";

import React, { Component, ReactNode } from 'react';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface ErrorFallbackProps {
    error: Error;
    resetErrorBoundary: () => void;
}

/**
 * Default error fallback UI
 */
const DefaultErrorFallback: React.FC<ErrorFallbackProps> = ({
    error,
    resetErrorBoundary,
}) => {
    return (
        <div className="flex flex-col items-center justify-center min-h-[300px] p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                Something went wrong
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6 max-w-md">
                {error.message || 'An unexpected error occurred. Please try again.'}
            </p>
            <div className="flex gap-3">
                <button
                    onClick={resetErrorBoundary}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                    <RefreshCw className="w-4 h-4" />
                    Try again
                </button>
                <a
                    href="/"
                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-lg font-medium transition-colors"
                >
                    <Home className="w-4 h-4" />
                    Go home
                </a>
            </div>
        </div>
    );
};

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

interface ErrorBoundaryProps {
    children: ReactNode;
    fallback?: ReactNode | ((props: ErrorFallbackProps) => ReactNode);
    onReset?: () => void;
    onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

/**
 * Base Error Boundary class component
 */
class BaseErrorBoundary extends Component<
    ErrorBoundaryProps & { queryReset?: () => void },
    ErrorBoundaryState
> {
    constructor(props: ErrorBoundaryProps & { queryReset?: () => void }) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
        console.error('Error caught by boundary:', error, errorInfo);
        this.props.onError?.(error, errorInfo);
    }

    resetErrorBoundary = (): void => {
        this.props.onReset?.();
        this.props.queryReset?.();
        this.setState({ hasError: false, error: null });
    };

    render(): ReactNode {
        if (this.state.hasError && this.state.error) {
            const { fallback } = this.props;

            if (typeof fallback === 'function') {
                return fallback({
                    error: this.state.error,
                    resetErrorBoundary: this.resetErrorBoundary,
                });
            }

            if (fallback) {
                return fallback;
            }

            return (
                <DefaultErrorFallback
                    error={this.state.error}
                    resetErrorBoundary={this.resetErrorBoundary}
                />
            );
        }

        return this.props.children;
    }
}

export interface QueryErrorBoundaryProps {
    children: ReactNode;
    /** Custom fallback UI or render function */
    fallback?: ReactNode | ((props: ErrorFallbackProps) => ReactNode);
    /** Callback when error is reset */
    onReset?: () => void;
    /** Callback when error is caught */
    onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

export const QueryErrorBoundary: React.FC<QueryErrorBoundaryProps> = ({
    children,
    fallback,
    onReset,
    onError,
}) => {
    return (
        <QueryErrorResetBoundary>
            {({ reset }) => (
                <BaseErrorBoundary
                    fallback={fallback}
                    onReset={onReset}
                    onError={onError}
                    queryReset={reset}
                >
                    {children}
                </BaseErrorBoundary>
            )}
        </QueryErrorResetBoundary>
    );
};

export default QueryErrorBoundary;
