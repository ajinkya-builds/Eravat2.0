import { useMemo, useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';

export type SearchableOption = { id: string; name: string };

export function SearchableSelect({
    label,
    value,
    options,
    onChange,
    disabled,
    placeholder,
    required,
}: {
    label: string;
    value: string | null;
    options: SearchableOption[];
    onChange: (id: string | null) => void;
    disabled?: boolean;
    placeholder?: string;
    required?: boolean;
}) {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);

    const selected = options.find((o) => o.id === value) ?? null;
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return options;
        return options.filter((o) => o.name.toLowerCase().includes(q));
    }, [options, query]);

    return (
        <div className="space-y-2 relative">
            <label className="text-xs text-muted-foreground">
                {label}
                {required && <span className="text-destructive"> *</span>}
            </label>
            <button
                type="button"
                disabled={disabled}
                onClick={() => {
                    if (disabled) return;
                    setOpen((v) => !v);
                    setQuery('');
                }}
                className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm text-left flex items-center justify-between gap-2 disabled:opacity-50"
            >
                <span className={selected ? 'text-foreground truncate' : 'text-muted-foreground'}>
                    {selected?.name || placeholder || 'Select…'}
                </span>
                <ChevronsUpDown size={14} className="text-muted-foreground shrink-0" />
            </button>
            {open && !disabled && (
                <div className="absolute z-30 mt-1 w-full rounded-xl border border-border bg-background shadow-lg overflow-hidden">
                    <input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={placeholder}
                        className="w-full px-3 py-2 text-sm border-b border-border bg-transparent outline-none"
                    />
                    <div className="max-h-48 overflow-y-auto">
                        <button
                            type="button"
                            onClick={() => {
                                onChange(null);
                                setOpen(false);
                            }}
                            className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:bg-muted/60"
                        >
                            {placeholder || 'Select…'}
                        </button>
                        {filtered.map((o) => (
                            <button
                                key={o.id}
                                type="button"
                                onClick={() => {
                                    onChange(o.id);
                                    setOpen(false);
                                }}
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/60 ${
                                    o.id === value ? 'bg-primary/10 text-primary font-semibold' : 'text-foreground'
                                }`}
                            >
                                {o.name}
                            </button>
                        ))}
                        {filtered.length === 0 && (
                            <p className="px-3 py-2 text-xs text-muted-foreground">No matches</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
