/**
 * URLs for files in `public/`. Must include Vite `import.meta.env.BASE_URL`
 * so GitHub Pages (e.g. /Eravat2.0/) does not request `/file.png` at site root.
 */
export function publicAsset(file: string): string {
  const name = file.startsWith('/') ? file.slice(1) : file;
  const base = import.meta.env.BASE_URL;
  return base.endsWith('/') ? `${base}${name}` : `${base}/${name}`;
}

export const ELEPHANT_LOGO_URL = publicAsset('elephant-logo.png');
