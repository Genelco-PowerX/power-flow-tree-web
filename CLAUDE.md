# CLAUDE.md

This file provides **instructions for Claude Code (claude.ai/code)** when working with code in this repository. It contains **critical safety rules**, **workflow guidelines**, **style conventions**, **UI/UX rules**, and **system architecture details**.  

---

# 🚨 CRITICAL SAFETY RULE  
**NEVER, UNDER ANY CIRCUMSTANCES, USE COMMANDS THAT RESET, DROP, OR DELETE A DATABASE.**  
- This includes commands such as:  
  - `prisma migrate reset --force`  
- **Data loss is unacceptable.** This rule must not be violated for any reason.  
- **This is a hard-stop rule with no exceptions.**  

---

# Development Workflow

1. **Think first**: Review the problem, scan relevant files, and draft a plan in `tasks/todo.md`.  
2. **Write a todo list**: Break the plan into discrete, checkable items.  
3. **Check in**: Wait for human verification of your plan before coding.  
4. **Implement**: Work through todo items step by step, checking them off as you go.  
5. **Review**: Add a “Review” section to `tasks/todo.md` summarizing changes and key notes.  
6. **Commit often**: Commit logical chunks of work regularly.  

⚠️ **Always Works™ Reminder**: Do not mark an item complete until you have verified it works in practice (see testing section).  

---

# Commands & Environment Setup

### Development Commands
- `npm run dev` — Start development server (http://localhost:3000)  
- `npm run build` — Create production build  
- `npm run start` — Start production server  
- `npm run lint` — Run ESLint  
- `npm run type-check` — Run TypeScript type checks  

### Environment Setup
1. Copy `.env.example` → `.env.local`.  
2. Fill in Airtable credentials.  
3. Required variables:  
   - `AIRTABLE_API_KEY`  
   - `AIRTABLE_BASE_ID`  
   - `AIRTABLE_TABLE_ID`  

---

# Core Principles

1. **Simplicity**: Write clear, step-by-step code understandable by newcomers.  
2. **Best Practices**: Ensure code is maintainable, optimized, and industry-standard.  
3. **User-Centric Design**: Favor intuitive, responsive interfaces.  
4. **React Compatibility**: Write components that work naturally with React.  
5. **Always Works™ Mindset**:  
   - “Should work” ≠ “Does work.”  
   - Never assume correctness — prove it by testing.  
   - Untested code is just a guess.  

---

# Code Style & Structure

### CSS & Tailwind
- **Custom CSS Classes**: `kebab-case`  
  ```css
  /* ✓ Correct */
  .user-profile {}
  .nav-link-active {}

  /* ✗ Incorrect */
  .userProfile {}
  .NavLinkActive {}
  ```

- **Tailwind Utility Classes**: Follow conventions exactly.  
  ```tsx
  // ✓ Correct
  className="text-sm md:text-base hover:bg-gray-100"

  // ✗ Incorrect
  className="TEXT_SM MD_TEXT_BASE HOVER_BG_GRAY_100"
  ```

### File Organization
- Group code into: exported components, subcomponents, helpers, static content, types.  
- Always add a file-level comment describing purpose.  

```tsx
// auth-wizard.tsx
// This component handles user authentication flow
```

---

# UI & Layout Guidelines

This section merges spacing, responsiveness, typography, accessibility, and mobile rules.  

### General Rules
- Use **Tailwind CSS** for all styling.  
- Prefer **Shadcn UI components** + **Lucide icons**.  
- Apply **Framer Motion** for animations.  
- Mobile-first approach for all layouts.  

---

### Spacing
- Wrap content in `container max-w-7xl mx-auto`.  
- Horizontal padding: `px-4` or `px-6`.  
- Vertical padding: `py-6` or `py-8`.  
- Use Tailwind’s 4px/8px scale consistently:  
  - 4px (1): tight spacing  
  - 8px (2): small spacing  
  - 16px (4): medium  
  - 24px (6): large  
  - 32px (8): section separation  

```tsx
// ✓ Correct
<Card className="p-6 md:p-8" />

// ✗ Incorrect
<Card className="pt-4 pb-2 px-3" />
```

⚠️ **Always Works™ Reminder**: Check visual hierarchy at multiple breakpoints before finalizing.  

---

### Responsive Design
- Use mobile-first breakpoints (`md:`, `lg:`).  
- Stack vertically on mobile, horizontally on desktop.  
  ```tsx
  className="flex flex-col md:flex-row"
  ```

- Scale typography responsively.  
  ```tsx
  className="text-sm md:text-base lg:text-lg"
  ```

---

### Mobile Input Guidelines
**Prevent Auto-Zoom (iOS Safari)**  
- Input fields must have `font-size >= 16px`.  
- Use `text-[16px]` or global CSS override.  

**Input Width**  
- Inputs should be `w-full` with parent padding ensuring proper spacing.  

**Compact Mobile Sizing**  
- Reduce height/padding for mobile:  
  - Inputs: `h-8 px-2`  
  - Buttons: `h-8 px-3`  
- Revert to larger defaults on desktop (`md:` classes).  

**Align with Parent Padding**  
- Don’t duplicate horizontal padding if container already has it.  
- Example: inside `CardContent px-6`, only apply vertical padding.  

---

### Typography
- Headings: `text-xl`–`text-3xl`, `font-semibold`  
- Body: `text-sm`–`text-base`  
- Labels: `text-xs`–`text-sm`  
- Use `text-muted-foreground` for secondary text.  

---

### Accessibility
- Maintain color contrast.  
- Use ARIA labels where needed.  
- Ensure keyboard navigation works.  
- Always use semantic HTML.  

⚠️ **Always Works™ Reminder**: Test by tabbing through forms and interacting with screen readers when possible.  

---

# Optimization & Best Practices

- Minimize `use client`, `useEffect`, `setState`.  
- Prefer **React Server Components** & Next.js SSR.  
- Use **dynamic imports** for code splitting.  
- Optimize images:  
  - Prefer WebP.  
  - Use `next/image` with dimensions + lazy loading.  
- Monitor Core Web Vitals (LCP, CLS, FID).  

---

# Error Handling & Validation

- Use **early returns** & guard clauses.  
- Implement **custom error types** for consistency.  

```ts
function processUserData(user: User | null): string {
  if (!user) throw new Error('User data is missing');
  if (!user.name) return 'Anonymous';
  return user.name.toUpperCase();
}
```

⚠️ **Always Works™ Reminder**: Trigger actual error scenarios during dev to confirm handling.  

---

# Dynamic Styles & Routes

### CSS Custom Properties
- Prefer **CSS variables** over inline styles.  
- Benefits: separation of concerns, better performance, maintainability.  

### Next.js Dynamic Route Params
- Always `await Promise.resolve(params)` before use.  
- Pass **resolved params** down to children.  
- Define TypeScript interfaces for route params.  

```ts
// Correct
const resolvedParams = await Promise.resolve(params);
const id = resolvedParams.id;
```

---

# Architecture & Data Flow

### Purpose
This is a **Next.js web app** that migrates an **Airtable extension** for visualizing **electrical power flow trees** using ReactFlow.  

### Data Flow
```
Airtable → Next.js API Routes → Cache → Frontend Components → ReactFlow
```

- Server-side only Airtable access (never expose credentials).  
- API routes cached with 5min TTL via `node-cache`.  

### Core Algorithm Steps
1. Build bidirectional connection maps (`tree-algorithms.ts`).  
2. Traverse upstream/downstream (max 10 levels, cycle detection).  
3. Detect/merge loop groups (ring bus).  
4. Classify S1/S2 sources with override logic.  
5. Calculate layout (collision detection, spacing).  
6. Generate ReactFlow nodes/edges.  

### Domain Concepts
- **S1/S2 Sources**: Primary (S1, blue) vs backup (S2, bright blue).  
- **Downstream**: Orange.  
- **Selected Equipment**: Bright green.  
- **Loop Groups**: Ring bus systems merged into single nodes.  

### Key Files
- `app/lib/tree-algorithms.ts` — Core logic.  
- `app/lib/airtable.ts` — Secure Airtable client.  
- `app/lib/types.ts` — Shared TypeScript types.  
- `app/lib/cache.ts` — Server caching utils.  

---

# Testing & Verification — Always Works™

**Philosophy**  
- Pattern-matching isn’t enough — tested code is the only valid code.  
- Untested = broken until proven otherwise.  
- Code must **work in practice**, not just in theory.  

### 30-Second Reality Check (must be YES for all)  
- Did I run/build the code?  
- Did I trigger the exact feature I changed?  
- Did I observe expected results with my own eyes (UI/API/data)?  
- Did I check logs/errors?  
- Would I bet $100 this works?  

### Testing Requirements  
- **UI Changes**: Click it.  
- **API Changes**: Call it.  
- **Data Changes**: Query the DB.  
- **Logic Changes**: Run the scenario.  
- **Config Changes**: Restart and confirm.  

### Phrases to Avoid  
- “This should work now.”  
- “Try it now” (without testing yourself).  
- “Logic is correct so…”  

### The Embarrassment Test  
“If the user records trying this and it fails, would I be embarrassed?”  

### Time Reality  
- Time saved skipping tests: ~30s  
- Time wasted when wrong: ~30m  
- User trust lost: priceless  

---

✅ End of **CLAUDE.md**  
