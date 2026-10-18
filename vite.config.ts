import {copyFileSync} from "node:fs";
import path from "node:path";
import {defineConfig, loadEnv, type Plugin} from "vite";
import react from "@vitejs/plugin-react-swc";

// GitHub Pages serves 404.html for unknown paths; a copy of index.html lets client-side routes deep-link.
function spaFallback(): Plugin {
    return {
        name: "spa-fallback-404",
        apply: "build",
        closeBundle() {
            const out = path.resolve(import.meta.dirname, "dist");
            copyFileSync(path.join(out, "index.html"), path.join(out, "404.html"));
        },
    };
}

export default defineConfig(({mode}) => {
    const env = loadEnv(mode, import.meta.dirname, "");
    return {
        // "/venture/" on GitHub Pages; "/" for a custom domain or another host.
        base: env.VITE_BASE_PATH || "/",
        plugins: [react(), spaFallback()],
        server: {port: 8087, strictPort: true, host: true},
        resolve: {
            alias: {"@": path.resolve(import.meta.dirname, "./src")},
        },
        build: {
            outDir: "dist",
            emptyOutDir: true,
            rollupOptions: {
                output: {
                    manualChunks(id) {
                        if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return "vendor-react";
                        if (id.includes("node_modules/@supabase")) return "vendor-supabase";
                        if (id.includes("node_modules/@radix-ui")) return "vendor-ui";
                        if (id.includes("node_modules/@tanstack")) return "vendor-query";
                        if (id.includes("node_modules/lucide-react")) return "vendor-icons";
                    },
                },
            },
        },
    };
});
