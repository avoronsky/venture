import type {ReactNode} from "react";
import {Globe, Linkedin, Mail} from "lucide-react";
import {linkedinHref, linkedinLabel, websiteHref, websiteLabel} from "@/lib/websites";
import {cn} from "@/lib/utils";

/** Website, email and LinkedIn as small links. Blank or unusable values are left out. */
export function ContactLinks({website, email, linkedin, className}: {website?: string; email?: string; linkedin?: string; className?: string}) {
    const site = website ? websiteHref(website) : null;
    const li = linkedin ? linkedinHref(linkedin) : null;
    const mail = email?.trim();
    if (!site && !li && !mail) return null;
    return (
        <span className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-sm", className)}>
            {site && <LinkItem href={site} icon={<Globe/>} label={websiteLabel(website!)} external/>}
            {mail && <LinkItem href={`mailto:${mail}`} icon={<Mail/>} label={mail}/>}
            {li && <LinkItem href={li} icon={<Linkedin/>} label="LinkedIn" title={linkedinLabel(linkedin!)} external/>}
        </span>
    );
}

function LinkItem({href, icon, label, title, external}: {href: string; icon: ReactNode; label: string; title?: string; external?: boolean}) {
    return (
        <a href={href} title={title} onClick={(e) => e.stopPropagation()}
           {...(external ? {target: "_blank", rel: "noreferrer noopener"} : {})}
           className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground underline decoration-foreground/20 underline-offset-2 hover:text-foreground [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0">
            {icon}<span className="truncate">{label}</span>
        </a>
    );
}
