# User Welcome Dashboard – Redesign Proposal

This document outlines suggested improvements for a full redesign of the user welcome dashboard (`/dashboard`), including layout, navigation, and content hierarchy.

---

## 1. Hero & Welcome

| Current | Suggested |
|--------|------------|
| Static "Welcome back, {name}!" | **Time-of-day greeting** ("Good morning", "Good afternoon", "Good evening") + first name |
| Generic subtitle | **Action-oriented subtitle** ("Here’s your overview" / "Pick up where you left off") |
| No context | **Date + role badge** (e.g. "Monday, Feb 9" and a small "User" / "Agent" / "Admin" pill) |

**Why:** Makes the page feel personal and gives quick context without clutter.

---

## 2. Quick Navigation (above the fold)

- Add a **horizontal "Jump to" strip** of pill/chip links: Dashboard, Tickets, ToDo, Time tracking, Links, Settings (only show items the user can access via enabled modules and permissions).
- Gives a second way to navigate without opening the sidebar, especially useful on mobile and for power users.

---

## 3. Stats / KPI Cards

| Current | Suggested |
|--------|------------|
| Cards are display-only | **Make stat cards clickable** – e.g. "Unresolved Tickets" links to `/dashboard/tickets` with the right filter |
| No trend | **Optional trend or delta** (e.g. "+2 this week", "3 due soon") where data exists |
| Same visual weight for all | **Primary metric** (e.g. "Assigned to me" for agents) slightly emphasized (size or position) |

**Why:** Turns the dashboard into a real control panel: one click from a number to the right list.

---

## 4. Layout & Content Hierarchy

- **Two-column layout (desktop):**
  - **Left (wider):** Welcome hero → Stat cards → **Shortcuts / Quick start** (one primary CTA + a few secondary).
  - **Right (narrower):** **"Recent" or "Continue where you left off"** – combined recent tickets, recent todos, and optionally active timer in one panel (tabs or sections).
- **Mobile:** Single column – Hero → Quick nav chips → Stats → Shortcuts → Recent.

**Why:** Clear "overview" vs "continue working" split; recent items become the main entry point for returning users.

---

## 5. Quick Actions → Shortcuts

| Current | Suggested |
|--------|------------|
| All actions look the same | **One primary CTA** (e.g. "New ticket" or "New todo") – larger, filled button |
| Label "Quick Actions" | **"Shortcuts" or "Quick start"** with 1 primary + 3–4 secondary (icon + label) |
| Grid of equal cards | **Primary action** could be a banner or top card; rest in a compact row or small grid |

**Why:** Reduces decision fatigue and makes the main next step obvious.

---

## 6. Recent Activity (unified)

- **Single "Recent" block** instead of separate "Recent Tickets" and (for agents) "Unassigned Tickets":
  - Subsections or tabs: **Tickets** | **ToDo** | **Links** (only show sections the user has access to).
  - Each row: icon, title, type badge, status, "View" link.
  - "View all →" per subsection.
- **Empty state:** When there are no recent items, show a short message + CTA (e.g. "No tickets yet – Create your first ticket").

**Why:** One place to "continue where you left off" for all content types; scales when more modules (e.g. links) are enabled.

---

## 7. Visual & UX Consistency

- **Unified card style:** Same border, radius, shadow, and padding for all dashboard cards.
- **Section titles:** Clear heading + optional "View all →" on the right.
- **Loading:** Skeleton placeholders for stats and recent list to avoid layout shift.
- **Empty states:** Friendly copy + primary action button for each section when there’s no data.

---

## 8. Role-Specific Tweaks

- **User:** Focus on "Your work" (your tickets, your todos, your time). Single primary CTA (e.g. Create ticket). No "Unassigned" block.
- **Agent:** Keep assigned vs unassigned but present in a clearer way (e.g. two columns or tabs under one "Tickets" section). Primary CTA can be "Pick up unassigned" or "My assigned".
- **Admin:** Keep high-level stats; add a small **System** or **Quick links** strip (Users, Modules, Settings, Audit) so admin tasks are one click away.

---

## 9. Optional Enhancements (later)

- **Recently visited pages** (last 3–4 routes) in the header or sidebar.
- **Search** already in header; consider a dashboard-specific "Quick find" that searches tickets + todos + links.
- **Active timer** in the "Recent" column when time-tracking is enabled (already have FloatingTimerWidget; could add a compact "Timer running" card on the dashboard).

---

## Summary

| Area | Main change |
|------|-------------|
| Hero | Time-of-day greeting, date, role badge |
| Navigation | "Jump to" chip strip (respects modules/permissions) |
| Stats | Clickable cards, optional trend, primary metric emphasized |
| Layout | Two-column: Overview (left) + Recent (right); stack on mobile |
| Actions | One primary CTA + Shortcuts for the rest |
| Recent | Unified Recent (Tickets / ToDo / Links) with empty states |
| Consistency | Shared card style, section titles, skeletons, empty states |
| Roles | User / Agent / Admin variants as above |

These changes keep the current data and permissions model but improve clarity, wayfinding, and the "home base" feel of the welcome dashboard.
