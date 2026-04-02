# Bugs Found During Review

Bugs discovered during code review, with commit references showing the fix.

---

## Bug 1: Infinite recursion in org_memberships RLS policy
- **Found in:** commit 853e46a
- **Description:** The `org_memberships_select` policy queried `org_memberships` itself to check if the user belongs to the org (`SELECT org_id FROM org_memberships WHERE user_id = auth.uid()`). PostgreSQL evaluates this subquery under the same RLS policy, triggering infinite recursion. Error: `42P17 infinite recursion detected in policy for relation "org_memberships"`.
- **Impact:** Every operation touching org_memberships (including org creation) returned a 500 error. The entire app was unusable.
- **Fixed in:** commit daaf6df
- **How:** Created two `SECURITY DEFINER` helper functions (`get_user_org_ids()` and `user_has_org_role()`) that bypass RLS, then rewrote all policies across all 9 tables to use these helpers instead of self-referencing subqueries.

## Bug 2: Base UI DropdownMenuLabel requires DropdownMenuGroup wrapper
- **Found in:** commit 853e46a
- **Description:** shadcn/ui v4 uses Base UI (not Radix) primitives. `DropdownMenuLabel` renders `MenuPrimitive.GroupLabel` which requires being inside a `MenuPrimitive.Group`. The org-switcher used `DropdownMenuLabel` without wrapping it in `DropdownMenuGroup`, causing: `MenuGroupRootContext is missing`.
- **Impact:** Org switcher dropdown crashed on render, preventing org switching.
- **Fixed in:** commit 898c140
- **How:** Wrapped `DropdownMenuLabel` inside `DropdownMenuGroup` in the org-switcher. Also fixed Trigger components to use Base UI's `render` prop pattern instead of nested children.

## Bug 3: Org creation fails — SELECT policy blocks .select() before membership exists
- **Found in:** commit 853e46a
- **Description:** The org creation route does `.insert({ name, slug }).select().single()` using the user's Supabase client. The INSERT succeeds (policy: `WITH CHECK true`), but the chained `.select()` triggers the organizations SELECT policy which requires `id IN (get_user_org_ids(auth.uid()))`. Since the membership hasn't been created yet, the SELECT returns nothing and `.single()` fails with RLS violation 42501.
- **Impact:** Users could not create organizations at all.
- **Fixed in:** commit 532bfeb
- **How:** Used the admin client (service role, bypasses RLS) for the initial org + membership creation. All subsequent operations use the user's client with RLS.

## Bug 4: Circular RLS recursion between notes and note_shares
- **Found in:** commit f9acacb
- **Description:** `notes_select` policy checked `EXISTS (SELECT 1 FROM note_shares ...)` for shared visibility. `note_shares_select` policy checked `EXISTS (SELECT 1 FROM notes ...)` for org access. This created: notes_select → note_shares_select → notes_select → infinite recursion. Error: `42P17 infinite recursion detected in policy for relation "notes"`.
- **Impact:** Creating, listing, and searching notes all failed with 500 errors. The entire notes feature was broken.
- **Fixed in:** commit 083b8d2
- **How:** Added two more SECURITY DEFINER helper functions: `user_can_access_note_org()` (checks org membership via notes without triggering notes RLS) and `user_is_shared_on_note()` (checks note_shares without triggering note_shares RLS). Rewrote policies for notes, note_versions, note_shares, and ai_summaries to use these helpers, breaking all circular references.

## Bug 5: Base UI PopoverTrigger requires native button element
- **Found in:** commit 2b75a64
- **Description:** TagInput used a `<div>` inside `PopoverTrigger render={...}` but Base UI requires a native `<button>` element when `nativeButton` is true (default). Console warning: "A component that acts as a button expected a native `<button>`".
- **Impact:** Console warnings and potential accessibility issues with tag autocomplete.
- **Fixed in:** commit 083b8d2
- **How:** Replaced the Popover/Command pattern with a plain dropdown list rendered conditionally below the input. No Base UI trigger needed.
