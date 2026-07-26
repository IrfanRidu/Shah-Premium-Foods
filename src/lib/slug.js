// Pure, dependency-free URL-slug helpers.
//
// Why this file exists separately from lib/utils.js: utils.js imports
// react-hot-toast at module scope (for axiosToastError()). That's harmless in
// client components, but importing ANY named export from a module also runs
// that module's other top-level imports — so a Server Component that only
// wanted extractIdFromSlug() would still pull react-hot-toast into the
// server bundle. These two functions are pure string logic with zero
// dependencies, so they're kept here and re-exported from utils.js for the
// existing client call sites (no behavior change, no breaking imports —
// every current `import { validURLConvert } from "@/lib/utils"` keeps
// working exactly as before). New server-only code (generateMetadata,
// Server Components) should import directly from here instead.
export const validURLConvert = (name = "", id = "") => {
  const slug = name
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
  return `${slug}-${id}`;
};

export const extractIdFromSlug = (slug = "") => {
  const m = slug.match(/([a-f0-9]{24})$/i);
  return m ? m[1] : null;
};
