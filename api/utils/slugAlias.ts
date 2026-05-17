export function isMissingSlugAliasTableError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === '42P01'
    || message.includes('relation "form_slug_aliases" does not exist')
    || message.includes("could not find the table 'form_slug_aliases'")
    || message.includes("could not find the table 'public.form_slug_aliases'");
}
