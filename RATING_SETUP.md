# Athlete Rating System Setup

## What Changed

1. **New Database Table**: `athlete_ratings` - stores business ratings of athletes (1-5 stars)
2. **New Columns**: `athlete_profiles` now includes:
   - `average_rating`: numeric(3,2) - average of all ratings
   - `total_ratings`: integer - count of ratings received
3. **Business Dashboard**: New "Rate Athlete" button after approving a campaign
4. **Athlete Dashboard**: 
   - Shows their average rating
   - Blocks applications if rating < 1.5 stars
   - Clear messaging about rating eligibility

## Setup Steps

### 1. Apply the Schema Migration to Supabase

Go to Supabase SQL Editor and run:

```bash
# Copy the entire contents of supabase/athlete-ratings.sql
# and paste into Supabase SQL Editor
```

Or use CLI if set up:

```bash
supabase db push
```

### 2. Reseed Test Users (if needed)

```bash
npm run test:seed
```

## How It Works

### For Businesses
- After approving an athlete's proof of work, a "Rate Athlete" button appears
- Business can optionally rate the athlete 1-5 stars ⭐
- Add an optional review comment
- Ratings are calculated as average across all campaigns

### For Athletes
- Rating shows on their portal dashboard
- If average rating drops below 1.5 stars, they see a warning
- They cannot apply to new campaigns if rating < 1.5 stars
- Completing campaigns successfully and earning high ratings from businesses improves their profile

## Database Queries

The system uses:
- `SELECT average_rating FROM athlete_profiles WHERE id = ?` - check eligibility
- `INSERT INTO athlete_ratings (athlete_id, business_id, application_id, rating, review)` - save rating
- Automatic trigger recalculates `athlete_profiles.average_rating` after each INSERT on `athlete_ratings`

## Testing the Feature

1. **Manual test on athlete portal**: 
   - Go to /athlete, attempt to apply to campaign
   - Should succeed (no existing rating)
   - Rating shows as "No ratings yet"

2. **Rate via business portal**:
   - Go to /business
   - Approve an athlete's submitted proof
   - "Rate Athlete" button appears
   - Click to open rating modal
   - Drag for 1-5 stars, optionally add review
   - Submit

3. **See effect on athlete portal**:
   - Log out business, log in as athlete
   - Refresh athlete portal
   - Verify average rating displays
   - If below 1.5, verify block message appears on apply attempt

## Rollback (if needed)

To remove the rating system, run in Supabase SQL Editor:

```sql
DROP TRIGGER IF EXISTS athlete_ratings_update_stats ON public.athlete_ratings;
DROP FUNCTION IF EXISTS public.update_athlete_rating_stats();
DROP FUNCTION IF EXISTS public.recalculate_athlete_average_rating(uuid);
DROP TABLE IF EXISTS public.athlete_ratings;
ALTER TABLE public.athlete_profiles
  DROP COLUMN IF EXISTS average_rating,
  DROP COLUMN IF EXISTS total_ratings;
```

Then revert the component changes in Git.
