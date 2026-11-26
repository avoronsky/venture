import {type ReactNode, useEffect, useLayoutEffect, useRef} from "react";
import {Bold, Heading2, Italic, Link2, List, ListOrdered, Pilcrow, Underline, Undo2} from "lucide-react";
import {cn} from "@/lib/utils";

/** Links in the preview open in a new tab instead of inside the frame. */
function withBaseTarget(html: string): string {
    const base = `<base target="_blank">`;
    return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + base) : base + html;
}

/**
 * The email as a recipient sees it. A sandboxed frame without scripts: nothing in the email can run,
 * read the app, or reach the user's session. Always on white, like most mail apps.
 */
export function EmailPreview({html, narrow = false, className}: {html: string; narrow?: boolean; className?: string}) {
    return (
        <div className={cn("flex justify-center overflow-hidden rounded-lg border bg-sunken", className)}>
            <iframe
                title="Email preview"
                sandbox="allow-popups allow-popups-to-escape-sandbox"
                srcDoc={withBaseTarget(html)}
                className={cn("h-full bg-white transition-[width] duration-200", narrow ? "w-[390px] max-w-full border-x" : "w-full")}
            />
        </div>
    );
}

/** The HTML of an editable document, ready to save. */
function serialize(doc: Document): string {
    return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
}

interface VisualEditorProps {
    /** Loaded when the editor mounts; give it a new `key` to load different HTML. */
    initialHtml: string;
    onChange: (html: string) => void;
    /** Extra controls at the end of the toolbar. */
    toolbarExtra?: (insert: (text: string) => void) => ReactNode;
    className?: string;
}

/**
 * Edit the email the way it looks: type, paste from Google Docs or Word, format with the toolbar.
 * The document is the same HTML the HTML tab shows. Its frame allows no scripts, so pasted content can't run.
 */
export function VisualEditor({initialHtml, onChange, toolbarExtra, className}: VisualEditorProps) {
    const frame = useRef<HTMLIFrameElement>(null);
    const timer = useRef<number | undefined>(undefined);
    const changeRef = useRef(onChange);
    const initialRef = useRef(initialHtml);
    useEffect(() => {
        changeRef.current = onChange;
    }, [onChange]);

    const doc = () => frame.current?.contentDocument ?? null;
    const flush = () => {
        window.clearTimeout(timer.current);
        const d = doc();
        if (d?.body) changeRef.current(serialize(d));
    };

    // Write the document into the frame once, imperatively: no srcdoc, so nothing reloads it while typing.
    // A layout effect, so on unmount the frame is still in the page and the last keystrokes are saved.
    useLayoutEffect(() => {
        const win = frame.current?.contentWindow;
        const d = frame.current?.contentDocument;
        if (!win || !d) return;
        d.open();
        d.write(initialRef.current);
        d.close();
        d.designMode = "on";
        const schedule = () => {
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => d.body && changeRef.current(serialize(d)), 400);
        };
        const save = () => {
            window.clearTimeout(timer.current);
            if (d.body) changeRef.current(serialize(d));
        };
        d.addEventListener("input", schedule);
        win.addEventListener("blur", save);
        return () => {
            d.removeEventListener("input", schedule);
            win.removeEventListener("blur", save);
            save();
        };
    }, []);

    const exec = (command: string, value?: string) => {
        const d = doc();
        if (!d) return;
        frame.current?.contentWindow?.focus();
        d.execCommand(command, false, value);
        flush();
    };
    const insert = (text: string) => exec("insertText", text);
    const link = () => {
        const url = window.prompt("Link address", "https://");
        if (url && url !== "https://") exec("createLink", url);
    };

    const tools: {label: string; icon: ReactNode; run: () => void}[] = [
        {label: "Heading", icon: <Heading2/>, run: () => exec("formatBlock", "h2")},
        {label: "Paragraph", icon: <Pilcrow/>, run: () => exec("formatBlock", "p")},
        {label: "Bold", icon: <Bold/>, run: () => exec("bold")},
        {label: "Italic", icon: <Italic/>, run: () => exec("italic")},
        {label: "Underline", icon: <Underline/>, run: () => exec("underline")},
        {label: "Bulleted list", icon: <List/>, run: () => exec("insertUnorderedList")},
        {label: "Numbered list", icon: <ListOrdered/>, run: () => exec("insertOrderedList")},
        {label: "Link", icon: <Link2/>, run: link},
        {label: "Undo", icon: <Undo2/>, run: () => exec("undo")},
    ];

    return (
        <div className={cn("flex min-h-0 flex-col overflow-hidden rounded-lg border", className)}>
            <div className="flex flex-wrap items-center gap-0.5 border-b bg-card px-1.5 py-1" role="toolbar" aria-label="Formatting">
                {tools.map((t) => (
                    <button key={t.label} type="button" title={t.label} aria-label={t.label}
                            onMouseDown={(e) => e.preventDefault()} onClick={t.run}
                            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-sunken hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&_svg]:h-4 [&_svg]:w-4">
                        {t.icon}
                    </button>
                ))}
                {toolbarExtra && <span className="ml-auto">{toolbarExtra(insert)}</span>}
            </div>
            <iframe ref={frame} title="Email editor" sandbox="allow-same-origin" className="min-h-0 w-full flex-1 bg-white"/>
        </div>
    );
}

/** A small segmented control, styled like the theme switcher in the sidebar. */
export function Segmented<T extends string>({value, onChange, options, label}: {
    value: T; onChange: (v: T) => void; options: {value: T; label: ReactNode; title?: string}[]; label: string;
}) {
    return (
        <div className="inline-flex rounded-md bg-sunken p-0.5" role="radiogroup" aria-label={label}>
            {options.map((o) => (
                <button key={o.value} type="button" role="radio" aria-checked={value === o.value} title={o.title}
                        onClick={() => onChange(o.value)}
                        className={cn("inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[13px] text-muted-foreground transition-colors focus-visible:outline-2 focus-visible:outline-ring [&_svg]:h-3.5 [&_svg]:w-3.5",
                            value === o.value && "bg-card font-medium text-foreground shadow-[0_0_0_1px_var(--border)]")}>
                    {o.label}
                </button>
            ))}
        </div>
    );
}
