import type {ReactNode} from "react";
import {Globe, Linkedin, Mail} from "lucide-react";
import type {Contact} from "@/lib/contacts";
import {linkedinHref, linkedinLabel, websiteHref, websiteLabel} from "@/lib/websites";
import {cn} from "@/lib/utils";

/** The investor's website and its contacts with their email and LinkedIn, as links. For panel headers. */
export function InvestorLinks({website, contacts, max = 3, className}: {website: string; contacts: Contact[]; max?: number; className?: string}) {
    const site = websiteHref(website);
    const shown = contacts.slice(0, max);
    if (!site && !shown.length) return null;
    return (
        <div className={cn("flex flex-col gap-1.5 text-sm", className)}>
            {site && <LinkItem href={site} icon={<Globe/>} label={websiteLabel(website)} external/>}
            {shown.length > 0 && (
                <ul className="flex flex-col gap-1" aria-label="Contacts">
                    {shown.map((c, i) => (
                        <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                            {(c.name || c.role) && (
                                <span className="text-foreground">
                                    {c.name && <span className="font-medium">{c.name}</span>}
                                    {c.role && <span className="text-muted-foreground">{c.name ? ", " : ""}{c.role}</span>}
                                </span>
                            )}
                            <ContactLinks contact={c}/>
                        </li>
                    ))}
                    {contacts.length > max && <li className="text-muted-foreground">+{contacts.length - max} more in Details</li>}
                </ul>
            )}
        </div>
    );
}

/** Email and LinkedIn links for one contact. */
export function ContactLinks({contact, className}: {contact: Contact; className?: string}) {
    const li = contact.linkedin ? linkedinHref(contact.linkedin) : null;
    if (!contact.email && !li) return null;
    return (
        <span className={cn("inline-flex flex-wrap items-center gap-x-3 gap-y-0.5", className)}>
            {contact.email && <LinkItem href={`mailto:${contact.email}`} icon={<Mail/>} label={contact.email}/>}
            {li && <LinkItem href={li} icon={<Linkedin/>} label="LinkedIn" title={linkedinLabel(contact.linkedin!)} external/>}
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
