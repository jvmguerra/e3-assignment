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

## Bug 6: Font not applied to form elements (buttons, inputs, selects)
- **Found in:** commit 86e5187
- **Description:** Browsers use their own system UI font for <button>, <input>, <select>, and <textarea> elements, overriding CSS inheritance. Geist font was applied to body but buttons and other form elements showed the browser default font.
- **Impact:** Inconsistent typography across the app — note content used Geist but buttons, sidebar, and tags used the browser default.
- **Fixed in:** commit e769c52
- **How:** Added global CSS rule `button, input, select, textarea, [role="button"] { font-family: inherit; }` to force our font stack on all form elements.

## Bug 7: Sidebar footer grows with page content
- **Found in:** commit 86e5187
- **Description:** Dashboard root used `min-h-screen` which allowed the sidebar to stretch beyond the viewport when the main content was tall. The sidebar footer (user info + logout) scrolled off-screen.
- **Impact:** Users couldn't see the logout button or theme toggle without scrolling the entire page.
- **Fixed in:** commit e769c52
- **How:** Changed root from `min-h-screen` to `h-screen overflow-hidden`. Sidebar is now viewport-pinned, only the nav section and main content scroll independently.

## Bug 8: Stale org ID after cross-user login
- **Found in:** commit 86e5187
- **Description:** Zustand persists `activeOrgId` in localStorage. When alice logs in after bob, the store has bob's org ID. The org-switcher's auto-select only fired when `!activeOrgId` (falsy), but the stale ID is truthy. Notes query fired with bob's org → 403 or empty.
- **Impact:** Users saw an empty notes page after login until manually switching orgs.
- **Fixed in:** commit 86e5187
- **How:** Auto-select now validates stored org against user's actual org list. Also clears org store on auth state change (sign-out event), not just logout button click.

## Bug 9: Image preview infinite re-fetch loop
- **Found in:** commit 86e5187
- **Description:** useEffect for loading image previews depended on the `files` array, which is a new reference on every TanStack Query render. Same pattern as the search headers bug.
- **Impact:** Continuous API calls to fetch signed URLs, degrading performance.
- **Fixed in:** commit 86e5187
- **How:** Stabilized dependency with useMemo computing a string of file IDs.

## Bug 10: rehype-raw silently breaks markdown rendering
- **Found in:** commit 4a9abe2
- **Description:** rehype-raw tries to parse note content as HTML. Seeded notes containing characters like <, >, & caused the render tree to silently break — no error thrown, just empty output.
- **Impact:** Note content disappeared entirely after adding markdown support.
- **Fixed in:** commit 6bc3f0a
- **How:** Removed rehype-raw entirely. Warning blocks handled via pre-processing (split and render separately), image references converted to standard markdown syntax.
