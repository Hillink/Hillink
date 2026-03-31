# Module 5 Migration Instructions

## Status
❌ **BLOCKED:** `deliverable_requirements` and `deliverable_submissions` tables do not exist in your Supabase database.

## Solution

### Step 1: Copy the migration SQL
The migration file is located at:
```
supabase/deliverables.sql
```

### Step 2: Open Supabase SQL Editor
1. Go to your Supabase project: https://supabase.com/dashboard
2. Click on your project
3. Navigate to **SQL Editor** (left sidebar)
4. Click **+ New Query**

### Step 3: Paste and Execute
1. Open `supabase/deliverables.sql` in your editor
2. Copy the entire contents
3. Paste into the Supabase SQL Editor window
4. Click **Run** (or press Ctrl+Enter)

Wait for confirmation that all statements executed successfully.

### Step 4: Verify Tables Created
In Supabase:
1. Go to **Database** → **Tables**
2. Confirm you see:
   - `deliverable_requirements` table ✓
   - `deliverable_submissions` table ✓

### Step 5: Run E2E Tests
Back in your terminal:
```bash
npm run -s test:deliverables
```

Expected result: ✅ All 6 checklist items pass

## What the migration does

| Component | Purpose |
|-----------|---------|
| `deliverable_requirements` | Store submission requirements (type, deadline, is_required) for each campaign |
| `deliverable_submissions` | Store athlete submissions with versions, status, and review trail |
| `prepare_deliverable_submission()` trigger | Auto-compute `due_at` timestamp on INSERT |
| RLS policies | Enforce role-based access control |

## Checklist Tests

After applying the migration, these 6 items will be validated:

1. ✓ Athlete **cannot submit after deadline** (422 unless admin force)
2. ✓ Athlete **re-submit increments version**
3. ✓ Business **must provide rejection reason** (422 if missing)
4. ✓ All approved deliverables **auto-complete application**
5. ✓ Cross-business **403 Forbidden on review attempt**
6. ✓ Optional deliverables **don't block completion**

---

**Next Action:** Apply the SQL migration in Supabase, then run tests again.
