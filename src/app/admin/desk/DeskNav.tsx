'use client';

import Link from 'next/link';
import { ArrowLeft, Clock, MessageCircle } from 'lucide-react';

/**
 * The Support Desk's navigation: an inbox, the hours, and the way back.
 *
 * Deliberately short, and meant to stay short — the desk exists so that someone whose job
 * is answering chats is not reading past nineteen other sections to find the queue.
 *
 * The link back to the full admin is prominent on purpose. This is a workspace, not a
 * permission boundary: everyone here is a full admin and can reach every other screen by
 * typing the address. A short menu that implied otherwise would be worse than no menu.
 */

interface DeskNavProps {
    pathname: string;
    waiting: number;
}

const ITEMS = [
    { href: '/admin/desk', label: 'Support', icon: MessageCircle },
    { href: '/admin/desk/settings', label: 'Settings', icon: Clock },
];

export function DeskNav({ pathname, waiting }: DeskNavProps) {
    return (
        <nav aria-label="Support desk" className="flex flex-col gap-1">
            {ITEMS.map(item => {
                const isCurrent = pathname === item.href;

                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        aria-current={isCurrent ? 'page' : undefined}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                            isCurrent
                                ? 'bg-blue-600 text-white'
                                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5'
                        }`}
                    >
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1">{item.label}</span>

                        {item.href === '/admin/desk' && waiting > 0 && (
                            <span
                                aria-label={`${waiting} waiting for a reply`}
                                className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                                    isCurrent
                                        ? 'bg-white/20 text-white'
                                        : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                }`}
                            >
                                {waiting}
                            </span>
                        )}
                    </Link>
                );
            })}

            <Link
                href="/admin/overview"
                className="mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-400 transition hover:text-slate-700 dark:hover:text-slate-200"
            >
                <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
                Full admin
            </Link>
        </nav>
    );
}
