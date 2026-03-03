import React from "react";
import Link from "next/link";

interface NavLinkProps {
    href: string;
    children: React.ReactNode;
    external?: boolean;
    textColor?: string;
    textSize?: string;
}

function NavLink({
    href,
    children,
    external = false,
    textColor = "text-blue-600 dark:text-white",
    textSize = "text-md",
}: NavLinkProps): React.ReactElement {
    const className = `flex items-center gap-1.5 px-3 py-2 ${textSize} ${textColor} hover:bg-white/5 dark:hover:bg-white/5 rounded-lg transition-colors`;

    return external ? (
        <a href={href} className={className}>
            {children}
        </a>
    ) : (
        <Link href={href} className={className}>
            {children}
        </Link>
    );
}

export default NavLink;