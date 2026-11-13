# Supabase signs people in; our API keeps the session and the data

Accounts (`.scratch/accounts/spec.md`) need Google sign-in and email + password for a handful of invited people. We use Supabase Auth for that part only. The browser signs in with supabase-js, then hands the Supabase access token to our API once. The API verifies it against the project's JWKS, matches the email to its own `app_user` row, and from then on uses its own HMAC-signed, HttpOnly session cookie. Stories, Chats and images stay in our Postgres on the Oracle VM.

- **Why a cookie of our own:** images and audio are plain `<img>`/`<audio>` requests, which only a cookie can authorise; and a session that doesn't depend on Supabase keeps working when the free Supabase project pauses after a quiet week or is briefly down.
- **Why not Supabase's database too:** the VM's Postgres already holds everything, has no 500 MB cap and doesn't pause. Moving the data would buy nothing and add latency from Singapore to Singapore at best.
- **Why not our own accounts and OAuth:** Google sign-in, password hashing and account storage are what Supabase does for free; our own would add an OAuth client flow, password storage and resets to maintain.

Consequences: the allow-list lives in our database (People), not in Supabase; sign-ups are turned off in Supabase as a second lock. Disabling an Account in Storytell takes effect at once, whatever Supabase says. Supabase's email can't reach people outside the project's team without our own SMTP, so the Owner creates Members' passwords in the Supabase dashboard.
