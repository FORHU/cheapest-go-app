'use client';

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { apiFetch } from '@/lib/api/client';

interface ShareBookingFormProps {
    dbId: string;
    defaultEmail: string;
}

export default function ShareBookingForm({ dbId, defaultEmail }: ShareBookingFormProps) {
    const [email, setEmail] = useState(defaultEmail);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sentTo, setSentTo] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSending(true);
        setError(null);
        setSentTo(null);

        const result = await apiFetch(`/api/trips/${dbId}/share`, { email: email.trim() });

        setIsSending(false);
        if (result.success) {
            setSentTo(email.trim());
        } else {
            setError(result.error || 'Failed to send. Please try again.');
        }
    };

    return (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Input
                label="Send to"
                type="email"
                icon={Mail}
                required
                value={email}
                onChange={(e) => { setEmail(e.target.value); setSentTo(null); }}
                placeholder="name@example.com"
            />

            {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
            {sentTo && (
                <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 size={15} /> Sent to {sentTo}.
                </p>
            )}

            <Button type="submit" isLoading={isSending} fullWidth>
                Send confirmation
            </Button>
        </form>
    );
}
