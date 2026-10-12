import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getSession } from '@/lib/auth/session';
import { describeInvitation } from '@/lib/server/golf/invitations';
import { AcceptInvitation } from './AcceptInvitation';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Course invitation', robots: { index: false, follow: false } };

const DEAD = ['unknown', 'expired', 'used', 'revoked'] as const;

/**
 * Opening an invitation changes nothing: it shows what is on offer and to whom, and accepting is
 * a button press by the account the invitation is for.
 */
export default async function JoinCoursePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const query = await searchParams;
    const token = typeof query.token === 'string' ? query.token : '';
    const [lookup, { user }, t] = await Promise.all([
        describeInvitation(token), getSession(), getTranslations('golf.staff.join'),
    ]);
    const here = `/course/join?token=${encodeURIComponent(token)}`;

    const shell = (title: string, children: React.ReactNode) => (
        <div className="mx-auto max-w-xl px-4 pb-24 pt-16">
            <h1 className="font-golf text-4xl font-extrabold leading-tight tracking-tight text-balance text-g-ink md:text-5xl">{title}</h1>
            <div className="mt-6 space-y-4 text-lg leading-relaxed text-g-muted">{children}</div>
        </div>
    );
    const link = 'font-medium text-g-accent underline-offset-4 hover:underline';

    if (lookup.state !== 'valid') {
        const key = DEAD.find(k => k === lookup.state) ?? 'unknown';
        return shell(t(`${key}Title`), (
            <>
                <p>{t(`${key}Body`)}</p>
                {user && <p><Link href="/course" className={link}>{t('goToPortal')}</Link></p>}
            </>
        ));
    }

    const title = t('title', { course: lookup.courseName });

    if (!user) {
        return shell(title, (
            <>
                <p>{t('invited', { course: lookup.courseName })}</p>
                <p>{t('signInLine', { email: lookup.email })}</p>
                <p>
                    <Link href={`/login?next=${encodeURIComponent(here)}`}
                        className="inline-block rounded-sm bg-g-accent px-6 py-3 text-base font-semibold text-g-accent-ink transition hover:bg-g-accent-hover">
                        {t('signInCta')}
                    </Link>
                </p>
            </>
        ));
    }

    if (user.role !== 'user' && user.role !== 'course_staff') {
        return shell(title, <p>{t('staffAccount', { email: user.email, invited: lookup.email })}</p>);
    }

    if (user.email.trim().toLowerCase() !== lookup.email) {
        return shell(title, (
            <>
                <p>{t('wrongAccount', { invited: lookup.email })}</p>
                <p>{t('wrongAccountHelp', { email: user.email })}</p>
            </>
        ));
    }

    return shell(title, (
        <>
            <p>{t('invited', { course: lookup.courseName })}</p>
            <p>{t('scope')}</p>
            <AcceptInvitation token={token} courseName={lookup.courseName} />
        </>
    ));
}
