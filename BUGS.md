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
